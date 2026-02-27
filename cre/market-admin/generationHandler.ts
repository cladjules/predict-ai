import {
  consensusIdenticalAggregation,
  HTTPClient,
  HTTPSendRequester,
  ok,
  Runtime,
  text,
  EVMClient,
  bytesToHex,
  hexToBase64,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  encodePacked,
} from "viem";
import { PredictionMarket } from "./types";
import { getNetwork } from "./utils";

export type Config = {
  generationSchedule: string;
  resolutionSchedule: string;
  backendUrl?: string;
  chainSelectorName?: string;
  contractAddress?: string;
  creatorAddress?: string;
  paymentToken?: string;
};

const CLAUDE_PROMPT = `You are a prediction market generator. Create 3 diverse and interesting prediction markets that people would want to bet on.

For each market, provide:
- title: A clear, concise title (max 100 chars)
- description: Detailed context and any relevant information (max 500 chars)
- options: 2-4 possible outcomes as an array of strings
- verificationUrl: A credible source URL that can be used to verify the outcome
- resolvesAt: ISO 8601 date when the market should resolve (between 1 week and 6 months from now)

Focus on diverse topics: sports, politics, technology, entertainment, economics, science, etc.
Ensure outcomes are clear, verifiable, and mutually exclusive.

Return ONLY a valid JSON array of objects matching this exact structure:
[
  {
    "title": "string",
    "description": "string",
    "options": ["string", "string"],
    "verificationUrl": "string",
    "resolvesAt": "2024-12-31T23:59:59Z"
  }
]`;

const fetchClaudeMarkets =
  (apiKey: string) => (sendRequester: HTTPSendRequester) => {
    const requestBody = Buffer.from(
      JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: CLAUDE_PROMPT,
          },
        ],
      }),
    ).toString("base64");

    const response = sendRequester
      .sendRequest({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: requestBody,
      })
      .result();

    if (!ok(response)) {
      throw new Error(
        `HTTP request failed with status: ${response.statusCode}`,
      );
    }

    return text(response);
  };

const storeMarketInBackend =
  (backendUrl: string, backendApiKey: string, marketData: any) =>
  (sendRequester: HTTPSendRequester) => {
    const response = sendRequester
      .sendRequest({
        url: `${backendUrl}/api/markets`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": backendApiKey,
        },
        body: Buffer.from(JSON.stringify(marketData)).toString("base64"),
      })
      .result();

    if (response.statusCode !== 201) {
      return { statusCode: response.statusCode, markets: [] };
    }

    try {
      const bodyText = new TextDecoder().decode(
        response.body || new Uint8Array(),
      );
      return JSON.parse(bodyText);
    } catch (e) {
      return { statusCode: 500, markets: [] };
    }
  };

export const onGenerationTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market generation triggered.");

  const secretResult = runtime.getSecret({
    id: "CLAUDE_API_KEY",
  });
  const secret = secretResult.result();
  const apiKey = secret.value;

  if (!apiKey) {
    runtime.log("ERROR: CLAUDE_API_KEY not found in secrets");
    return "Error: Missing API key";
  }

  const backendSecretResult = runtime.getSecret({
    id: "BACKEND_API_KEY",
  });
  const backendSecret = backendSecretResult.result();
  const backendApiKey = backendSecret.value;

  if (!backendApiKey) {
    runtime.log("ERROR: BACKEND_API_KEY not found in secrets");
    return "Error: Missing API key";
  }

  runtime.log("Calling Claude AI to generate prediction markets...");

  const httpClient = new HTTPClient();
  const responseText = httpClient
    .sendRequest(
      runtime,
      fetchClaudeMarkets(apiKey),
      consensusIdenticalAggregation<string>(),
    )()
    .result();

  const apiResponse = JSON.parse(responseText);

  const content = apiResponse.content[0];

  if (content && content.type === "text") {
    const marketsJson = content.text
      .trim()
      .replace("```json", "")
      .replace("```", "");

    const markets = JSON.parse(marketsJson) as PredictionMarket[];

    runtime.log(`Successfully generated ${markets.length} prediction markets`);

    // Store markets in the contract via CRE workflow
    if (markets.length > 0) {
      const chainSelectorName = runtime.config.chainSelectorName;
      const contractAddress = runtime.config.contractAddress;
      const creatorAddress = runtime.config.creatorAddress as `0x${string}`;

      if (!chainSelectorName || !contractAddress || !creatorAddress) {
        runtime.log(
          "WARNING: Chain selector, contract address, or creator address not configured for on-chain market creation",
        );
        return marketsJson;
      }

      const network = getNetwork(chainSelectorName);

      if (!network) {
        runtime.log(
          `ERROR: Network not found for chain selector: ${chainSelectorName}`,
        );
        return marketsJson;
      }

      const evmClient = new EVMClient(BigInt(network.chainSelector.selector));

      // Prepare blockchain params for all markets
      const paymentToken = runtime.config.paymentToken as `0x${string}`;

      const marketsWithParams = markets.map((market) => {
        const startsAt = BigInt(Math.floor(new Date().getTime() / 1000));
        const finishesAt = BigInt(
          Math.floor(new Date(market.resolvesAt).getTime() / 1000),
        );

        // Compute content hash including question, description, and blockchain params
        // Hash = keccak256(question, description, creator, outcomeCount, startsAt, finishesAt, paymentToken)
        const contentHash = keccak256(
          encodePacked(
            [
              "string",
              "string",
              "address",
              "uint8",
              "uint256",
              "uint256",
              "address",
            ],
            [
              market.title,
              market.description || "",
              creatorAddress,
              market.options.length,
              startsAt,
              finishesAt,
              paymentToken,
            ],
          ),
        );

        return {
          question: market.title,
          description: market.description,
          outcomes: market.options,
          resolvesAt: market.resolvesAt,
          contentHash: contentHash,
        };
      });

      if (runtime.config.backendUrl && backendApiKey) {
        try {
          const httpClient = new HTTPClient();
          const response = httpClient
            .sendRequest(
              runtime,
              storeMarketInBackend(
                runtime.config.backendUrl,
                backendApiKey,
                marketsWithParams,
              ),
              consensusIdenticalAggregation<any>(),
            )()
            .result();

          // Backend now returns { success: true, count: N, markets: [...] }
          if (response && response.markets && response.markets.length > 0) {
            runtime.log(
              `✅ Markets stored in database: ${response.markets.length} markets added`,
            );
          } else {
            runtime.log(
              `⚠️  Failed to store markets in database. Response: ${JSON.stringify(response)}`,
            );
            return marketsJson;
          }

          // Now create markets on-chain using the same params
          for (let i = 0; i < response.markets.length; i++) {
            const dbMarket = response.markets[i];
            const originalMarket = markets[i];

            // Recompute the blockchain params (same as when we created the hash)
            const startsAt = BigInt(Math.floor(new Date().getTime() / 1000));
            const finishesAt = BigInt(
              Math.floor(new Date(originalMarket.resolvesAt).getTime() / 1000),
            );

            runtime.log(
              `Creating market on-chain: "${dbMarket.question}" with ${originalMarket.options.length} outcomes`,
            );
            runtime.log(`  Content Hash: ${dbMarket.contentHash}`);

            // Encode market creation data for PredictionMarket._processReport()
            // Format: (uint8 opType, uint8 outcomeCount, uint256 startsAt, uint256 finishesAt, address paymentToken, address creator, bytes32 contentHash)
            // opType 2 = Market creation operation
            const marketData = encodeAbiParameters(
              parseAbiParameters(
                "uint8 opType, uint8 outcomeCount, uint256 startsAt, uint256 finishesAt, address paymentToken, address creator, bytes32 contentHash",
              ),
              [
                2, // opType 2 for market creation
                originalMarket.options.length,
                startsAt,
                finishesAt,
                paymentToken,
                creatorAddress,
                dbMarket.contentHash as `0x${string}`,
              ],
            );

            // Generate CRE report
            const reportResponse = runtime
              .report({
                encodedPayload: hexToBase64(marketData),
                encoderName: "evm",
                signingAlgo: "ecdsa",
                hashingAlgo: "keccak256",
              })
              .result();

            // Write report to PredictionMarket contract
            const writeResult = evmClient
              .writeReport(runtime, {
                receiver: contractAddress,
                report: reportResponse,
                gasConfig: {},
              })
              .result();

            if (writeResult.txStatus === TxStatus.SUCCESS) {
              // TxStatus.SUCCESS
              const txHash = bytesToHex(
                writeResult.txHash || new Uint8Array(32),
              );
              runtime.log(
                `✅ Market created on-chain: ${txHash} - "${dbMarket.question}"`,
              );

              // Backend database sync now handled by eventHandler listening to MarketCreated event
            } else {
              runtime.log(
                `ERROR: Failed to create market on-chain. Result: ${writeResult.txStatus}`,
              );
            }
          }

          return `Created ${response.markets.length} markets`;
        } catch (error) {
          runtime.log(`ERROR: Failed to process markets creation": ${error}`);
        }
      }
    }

    return `No markets created`;
  }

  runtime.log("ERROR: Unexpected response format from Claude");
  return "Error: Unexpected response format";
};

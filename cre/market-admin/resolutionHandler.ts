import {
  Runtime,
  HTTPSendRequester,
  HTTPClient,
  consensusIdenticalAggregation,
  text,
  ok,
  EVMClient,
  bytesToHex,
  hexToBase64,
  TxStatus,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { PredictionMarket } from "./types";
import { Config } from "./generationHandler";
import { getNetwork } from "./utils";
import { TextDecoder } from "util";

// Backend resolution update removed - now handled by eventHandler listening to MarketResolved events
// const updateMarketResolution = ...

const fetchMarketsToResolve =
  (apiKey: string, forceResolve: boolean, runtime: Runtime<Config>) =>
  (sendRequester: HTTPSendRequester) => {
    // Fetch markets from backend database that are eligible for resolution
    let eligibleMarkets: PredictionMarket[] = [];

    if (runtime.config.backendUrl && apiKey) {
      const response = sendRequester
        .sendRequest({
          url: `${runtime.config.backendUrl}/api/markets/active`,
          method: "GET",
          headers: {
            "x-api-key": apiKey,
          },
        })
        .result();

      if (response.statusCode === 200) {
        try {
          const bodyText = new TextDecoder().decode(
            response.body || new Uint8Array(),
          );
          const responseData = JSON.parse(bodyText);
          eligibleMarkets = responseData.markets || [];
          runtime.log(
            `Fetched ${eligibleMarkets.length} eligible markets from database`,
          );
        } catch (parseError) {
          runtime.log(
            `WARNING: Failed to parse backend response: ${parseError}`,
          );
        }
      } else {
        runtime.log(
          `WARNING: Failed to fetch markets from database. Status: ${response.statusCode}`,
        );
      }
    }

    if (forceResolve) {
      return eligibleMarkets.map((market) => ({ ...market, outcomeIndex: 0 }));
    }

    // Filter markets where resolvesAt is in the past
    const now = new Date();
    const marketsToResolve = eligibleMarkets.reduce((acc, market) => {
      let resolvesAt = new Date(market.resolvesAt);

      // If the time is exactly "00:00:00", adjust to end of day
      if (
        resolvesAt.getHours() === 0 &&
        resolvesAt.getMinutes() === 0 &&
        resolvesAt.getSeconds() === 0
      ) {
        resolvesAt = new Date(
          resolvesAt.getFullYear(),
          resolvesAt.getMonth(),
          resolvesAt.getDate(),
          23,
          59,
          59,
        );
      }

      if (resolvesAt <= now) {
        return [
          ...acc,
          {
            ...market,
            resolvesAt: resolvesAt.toISOString(),
          },
        ];
      }

      return acc;
    }, [] as PredictionMarket[]);

    if (marketsToResolve.length === 0) {
      return [];
    }

    // Build a single prompt with all markets
    const marketsList = marketsToResolve
      .map(
        (market, idx) =>
          `${idx + 1}. Question: "${market.question}"
   Description: "${market.description}"
   Verification URL: "${market.verificationUrl}"
   Outcomes: ${market.outcomes.join(", ")}
   Expected Resolution: ${market.resolvesAt}`,
      )
      .join("\n\n");

    const prompt = `Check which of the following prediction markets have resolved. For each market that has resolved, provide the outcome from the available outcomes. For markets that have not resolved yet, skip them.

${marketsList}

Return your response as a JSON array with objects containing: { "marketIndex": number (1-based), "resolved": boolean, "outcomeIndex": number (0-based) (the winning option from the outcomes array) }

Only include markets that have resolved. Return an empty array [] if none have resolved.`;

    const requestBody = Buffer.from(
      JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
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

    const apiResponse = JSON.parse(text(response))?.content[0];

    if (!apiResponse || apiResponse.type !== "text") {
      return [];
    }

    const jsonMatch = apiResponse.text.trim().match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const results = JSON.parse(jsonMatch[0]) as Array<{
      marketIndex: number;
      resolved: boolean;
      outcomeIndex: number;
    }>;

    // Map results back to markets
    const resolvedMarkets: PredictionMarket[] = results
      .filter((r) => r.resolved)
      .map((r) => ({
        ...marketsToResolve[r.marketIndex - 1],
        outcomeIndex: r.outcomeIndex,
      }));

    return resolvedMarkets;
  };

export const onResolutionTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Market resolution-checks triggered.");

  // Normal Claude-based resolution
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
  const forceResolve = !!runtime.config.forceResolve;

  const httpClient = new HTTPClient();
  const resolvedMarkets = httpClient
    .sendRequest(
      runtime,
      fetchMarketsToResolve(apiKey, forceResolve, runtime),
      consensusIdenticalAggregation<PredictionMarket[]>(),
    )()
    .result();

  runtime.log(
    `Resolved ${resolvedMarkets.length} markets: ${JSON.stringify(resolvedMarkets)}`,
  );

  const onChainTXs = [];

  // Send resolution to contract for each resolved market
  if (resolvedMarkets.length > 0) {
    // Get network and contract info from config
    const chainSelectorName = runtime.config.chainSelectorName;
    const contractAddress = runtime.config.contractAddress;

    if (!chainSelectorName || !contractAddress) {
      runtime.log(
        "WARNING: Network or contract address not configured for on-chain resolution",
      );
      return `Resolved ${resolvedMarkets.length} markets (not sent to chain)`;
    }

    const network = getNetwork(chainSelectorName);

    if (!network) {
      runtime.log(
        `ERROR: Could not resolve network for chainSelectorName: ${chainSelectorName}`,
      );
      return `Failed to resolve network`;
    }

    const evmClient = new EVMClient(BigInt(network.chainSelector.selector));

    for (const market of resolvedMarkets) {
      try {
        runtime.log(
          `Encoding resolution for market ${market.blockchainId || "unknown"}: outcome ${market.outcomeIndex}`,
        );
        runtime.log("yp");

        // Encode resolution data for PredictionMarket._processReport()
        // Format: (uint8 opType, uint256 marketId, uint8 winningOutcome)
        // opType 1 = Resolution operation
        const resolutionData = encodeAbiParameters(
          parseAbiParameters(
            "uint8 opType, uint256 marketId, uint8 winningOutcome",
          ),
          [
            1, // opType 1 for resolution
            BigInt(market.blockchainId || 0),
            market.outcomeIndex ?? 0,
          ],
        );

        // Generate CRE report
        const reportResponse = runtime
          .report({
            encodedPayload: hexToBase64(resolutionData),
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
            gasConfig: {
              gasLimit: "500000",
            },
          })
          .result();

        if (writeResult.txStatus === TxStatus.SUCCESS) {
          // TxStatus.SUCCESS
          const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
          runtime.log(
            `✅ Market ${market.blockchainId} resolved on-chain: ${txHash} - Outcome: (${market.outcomes[market.outcomeIndex ?? 0]})`,
          );

          onChainTXs.push(txHash);

          // Backend database sync now handled by eventHandler listening to MarketResolved event
          runtime.log(
            `Database sync will be handled by eventHandler on MarketResolved event`,
          );
        } else {
          runtime.log(
            `ERROR: Failed to resolve market ${market.blockchainId} on-chain. Status: ${writeResult.txStatus}`,
          );
        }
      } catch (error) {
        runtime.log(
          `ERROR: Failed to process resolution for market ${market.blockchainId}: ${error}`,
        );
      }
    }
  }

  return `Resolved ${resolvedMarkets.length} markets with txs: ${onChainTXs.join(", ")}`;
};

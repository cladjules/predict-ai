import {
  Runtime,
  EVMLog,
  bytesToHex,
  HTTPClient,
  HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import { Config } from "./paymentHandler";

export const eventAbi = parseAbi([
  "event MarketCreated(uint256 indexed marketId, address indexed creator, uint8 outcomeCount, uint256 finishesAt, address paymentToken, bytes32 contentHash)",
  "event PredictionPlaced(uint256 indexed predictionId, uint256 indexed marketId, address indexed predictor, uint8 outcome, uint256 amount, uint256 timestamp)",
  "event MarketResolved(uint256 indexed marketId, uint8 winningOutcome, uint256 totalPool, uint256 timestamp)",
]);

const updateMarketWithBlockchainId =
  (
    backendUrl: string,
    backendApiKey: string,
    blockchainId: string,
    contentHash: string,
  ) =>
  (sendRequester: HTTPSendRequester) => {
    // Find market with matching contentHash (read directly from blockchain event)
    const getResponse = sendRequester
      .sendRequest({
        url: `${backendUrl}/api/markets`,
        method: "GET",
        headers: {
          "x-api-key": backendApiKey,
        },
      })
      .result();

    if (getResponse.statusCode !== 200) {
      return { statusCode: getResponse.statusCode, updated: false };
    }

    try {
      const bodyText = new TextDecoder().decode(
        getResponse.body || new Uint8Array(),
      );
      const responseData = JSON.parse(bodyText);
      const markets = responseData.markets || [];

      // Find market with matching contentHash
      const marketToUpdate = markets.find(
        (m: any) => m.contentHash === contentHash && !m.blockchainId,
      );

      if (!marketToUpdate) {
        return {
          statusCode: 404,
          updated: false,
          error: `No market found with matching contentHash ${contentHash}`,
        };
      }

      // Update the market with blockchainId (keep contentHash for reference)
      const patchResponse = sendRequester
        .sendRequest({
          url: `${backendUrl}/api/market/${marketToUpdate._id}`,
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": backendApiKey,
          },
          body: Buffer.from(
            JSON.stringify({
              blockchainId: blockchainId,
            }),
          ).toString("base64"),
        })
        .result();

      return {
        statusCode: patchResponse.statusCode,
        updated: patchResponse.statusCode === 200,
        marketId: marketToUpdate._id,
      };
    } catch (e) {
      return { statusCode: 500, updated: false, error: String(e) };
    }
  };

const storePredictionInBackend =
  (
    backendUrl: string,
    backendApiKey: string,
    blockchainMarketId: string,
    predictionData: any,
  ) =>
  (sendRequester: HTTPSendRequester) => {
    try {
      // Store the prediction using the DB market _id
      const response = sendRequester
        .sendRequest({
          url: `${backendUrl}/api/market/${blockchainMarketId}/predictions`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": backendApiKey,
          },
          body: Buffer.from(JSON.stringify(predictionData)).toString("base64"),
        })
        .result();

      return {
        statusCode: response.statusCode,
        created: response.statusCode === 201,
      };
    } catch (e) {
      return { statusCode: 500, created: false, error: String(e) };
    }
  };

const updateMarketResolution =
  (
    backendUrl: string,
    backendApiKey: string,
    blockchainMarketId: string,
    outcomeIndex: number,
  ) =>
  (sendRequester: HTTPSendRequester) => {
    try {
      // Resolve the market using the DB marketId
      const response = sendRequester
        .sendRequest({
          url: `${backendUrl}/api/market/${blockchainMarketId}/resolve`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": backendApiKey,
          },
          body: Buffer.from(
            JSON.stringify({
              outcomeIndex: outcomeIndex,
            }),
          ).toString("base64"),
        })
        .result();

      return {
        statusCode: response.statusCode,
        resolved: response.statusCode === 200,
      };
    } catch (e) {
      return { statusCode: 500, resolved: false, error: String(e) };
    }
  };

export const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics.map((topic) => bytesToHex(topic)) as [
    `0x${string}`,
    ...`0x${string}`[],
  ];
  const data = bytesToHex(log.data);

  try {
    const decodedLog = decodeEventLog({
      abi: eventAbi,
      data,
      topics,
    });

    const eventName = decodedLog.eventName;

    const secretResult = runtime.getSecret({
      id: "BACKEND_API_KEY",
    });
    const secret = secretResult.result();
    const backendApiKey = secret.value;

    if (!backendApiKey) {
      runtime.log("ERROR: BACKEND_API_KEY not found in secrets");
      return "Error: Missing API key";
    }

    runtime.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    runtime.log(`CRE Workflow: ${eventName} Event`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Handle different event types
    if (eventName === "MarketCreated") {
      const {
        marketId,
        creator,
        outcomeCount,
        finishesAt,
        paymentToken,
        contentHash,
      } = decodedLog.args;

      runtime.log(`[Event] Market created:`);
      runtime.log(`  - Market ID: ${marketId}`);
      runtime.log(`  - Creator: ${creator}`);
      runtime.log(`  - Outcome Count: ${outcomeCount}`);
      runtime.log(`  - Finishes At: ${finishesAt}`);
      runtime.log(`  - Payment Token: ${paymentToken}`);
      runtime.log(`  - Content Hash: ${contentHash}`);

      // Update market in database with blockchainId
      if (runtime.config.backendUrl && backendApiKey) {
        try {
          const httpClient = new HTTPClient();
          const result = httpClient
            .sendRequest(
              runtime,
              updateMarketWithBlockchainId(
                runtime.config.backendUrl,
                backendApiKey,
                marketId.toString(),
                contentHash as string,
              ),
              consensusIdenticalAggregation<any>(),
            )()
            .result();

          if (result.updated) {
            runtime.log(
              `✅ Market database record updated with blockchain ID ${marketId} (DB ID: ${result.marketId})`,
            );
          } else {
            runtime.log(
              `⚠️  Failed to update market in database. Status: ${result.statusCode}${result.error ? `, Error: ${result.error}` : ""}`,
            );
          }
        } catch (backendError) {
          runtime.log(`⚠️  Failed to call backend API: ${backendError}`);
        }
      }

      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return `Processed MarketCreated for Market ID ${marketId}`;
    } else if (eventName === "PredictionPlaced") {
      const { predictionId, marketId, predictor, outcome, amount, timestamp } =
        decodedLog.args;

      runtime.log(`[Event] Prediction placed:`);
      runtime.log(`  - Prediction ID: ${predictionId}`);
      runtime.log(`  - Market ID: ${marketId}`);
      runtime.log(`  - Predictor: ${predictor}`);
      runtime.log(`  - Outcome: ${outcome}`);
      runtime.log(`  - Amount: ${amount}`);
      runtime.log(`  - Timestamp: ${timestamp}`);

      // Store prediction in database via HTTP call
      if (runtime.config.backendUrl && backendApiKey) {
        try {
          const httpClient = new HTTPClient();
          const result = httpClient
            .sendRequest(
              runtime,
              storePredictionInBackend(
                runtime.config.backendUrl,
                backendApiKey,
                marketId.toString(),
                {
                  payer: predictor,
                  outcomeIndex: outcome,
                  amount: Number(amount),
                  paymentToken: runtime.config.contractAddress, // Placeholder
                  x402TxHash: `pred_${predictionId}`,
                },
              ),
              consensusIdenticalAggregation<any>(),
            )()
            .result();

          if (result.created) {
            runtime.log(
              `✅ Prediction ${predictionId} stored in database for market (blockchain ID: ${marketId})`,
            );
          } else {
            runtime.log(
              `⚠️  Failed to store prediction in database. Status: ${result.statusCode}${result.error ? `, Error: ${result.error}` : ""}`,
            );
          }
        } catch (backendError) {
          runtime.log(`⚠️  Failed to call backend API: ${backendError}`);
        }
      }

      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return `Processed PredictionPlaced for Prediction ID ${predictionId}`;
    } else if (eventName === "MarketResolved") {
      const { marketId, winningOutcome, totalPool, timestamp } =
        decodedLog.args;

      runtime.log(`[Event] Market resolved:`);
      runtime.log(`  - Market ID: ${marketId}`);
      runtime.log(`  - Winning Outcome: ${winningOutcome}`);
      runtime.log(`  - Total Pool: ${totalPool}`);
      runtime.log(`  - Timestamp: ${timestamp}`);

      // Update database with market resolution via HTTP call
      if (runtime.config.backendUrl && backendApiKey) {
        try {
          const httpClient = new HTTPClient();
          const result = httpClient
            .sendRequest(
              runtime,
              updateMarketResolution(
                runtime.config.backendUrl,
                backendApiKey,
                marketId.toString(),
                winningOutcome,
              ),
              consensusIdenticalAggregation<any>(),
            )()
            .result();

          if (result.resolved) {
            runtime.log(
              `✅ Market (blockchain ID: ${marketId}) status updated to resolved in database`,
            );
          } else {
            runtime.log(
              `⚠️  Failed to update market status in database. Status: ${result.statusCode}${result.error ? `, Error: ${result.error}` : ""}`,
            );
          }
        } catch (backendError) {
          runtime.log(`⚠️  Failed to call backend API: ${backendError}`);
        }
      }

      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return `Processed MarketResolved for Market ID ${marketId}`;
    }

    runtime.log("⚠️  Unknown event type");
    return "Unknown event";
  } catch (error) {
    runtime.log(`ERROR: Failed to decode event: ${error}`);
    return "Error decoding event";
  }
};

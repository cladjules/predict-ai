import {
  Runtime,
  HTTPPayload,
  EVMClient,
  bytesToHex,
  hexToBase64,
  decodeJson,
  TxStatus,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";

import { getNetwork } from "./utils";

export type Config = {
  chainSelectorName: string;
  contractAddress: string;
  publicKey: string;
};

export const onHttpTrigger = (
  runtime: Runtime<Config>,
  payload: HTTPPayload,
): string => {
  if (!payload.input || payload.input.length === 0) {
    return "Empty request";
  }

  runtime.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Market Payment Received (X402)");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const inputData = decodeJson(payload.input);
  runtime.log(
    `[Step 1] Received prediction payment data: ${JSON.stringify(inputData)}`,
  );

  // Get network and EVM client
  const network = getNetwork(runtime.config.chainSelectorName);

  if (!network) {
    throw new Error(`Network not found`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  // Parse prediction data from X402 payment
  const prediction = {
    marketId: BigInt(inputData.marketId),
    predictor: inputData.predictor as `0x${string}`,
    outcome: inputData.outcome,
    amount: BigInt(inputData.amount),
    paymentToken: inputData.paymentToken as `0x${string}`,
    x402TxHash: inputData.x402TxHash,
    timestamp: BigInt(Date.now()),
  };

  runtime.log(
    `[Step 2] Processing prediction for market ${prediction.marketId}:`,
  );
  runtime.log(`  - Predictor: ${prediction.predictor}`);
  runtime.log(`  - Outcome: ${prediction.outcome}`);
  runtime.log(`  - Amount: ${prediction.amount}`);
  runtime.log(`  - Payment Token: ${prediction.paymentToken}`);
  runtime.log(
    `  - X402 Tx: ${prediction.x402TxHash} (tracked in backend only)`,
  );

  runtime.log(`[Step 3] Encoding prediction data for on-chain write...`);

  // Encode prediction data as ABI parameters for PredictionMarket._processReport()
  // Order must match: address predictor, uint256 marketId, uint8 outcome, uint256 amount, address paymentToken
  // Note: x402TxHash and timestamp kept in backend only for gas efficiency
  const predictionData = encodeAbiParameters(
    parseAbiParameters(
      "address predictor, uint256 marketId, uint8 outcome, uint256 amount, address paymentToken",
    ),
    [
      prediction.predictor,
      prediction.marketId,
      prediction.outcome,
      prediction.amount,
      prediction.paymentToken,
    ],
  );

  // Generate CRE report
  runtime.log(`[Step 4] Generating CRE report...`);
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(predictionData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  // Write report to PredictionMarket contract
  runtime.log(
    `[Step 5] Writing to PredictionMarket contract: ${runtime.config.contractAddress}`,
  );
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.contractAddress,
      report: reportResponse,
      gasConfig: {},
    })
    .result();

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    runtime.log(`[Step 6] [SUCCESS] Prediction recorded on-chain: ${txHash}`);
    runtime.log(
      `[Step 6] [SUCCESS] Market ${prediction.marketId} - Outcome ${prediction.outcome} - Amount ${prediction.amount}`,
    );
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return txHash;
  }

  throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
};

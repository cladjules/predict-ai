import {
  handler,
  Runner,
  HTTPCapability,
  EVMClient,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { keccak256, toBytes } from "viem";

import { getNetwork } from "./utils";
import { Config, onHttpTrigger } from "./paymentHandler";
import { onLogTrigger } from "./eventHandler";

const initWorkflow = (config: Config) => {
  const network = getNetwork(config.chainSelectorName);

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  // Event hashes for all PredictionMarket contract events
  const marketCreatedEventHash = keccak256(
    toBytes("MarketCreated(uint256,address,uint8,uint256,uint256,address)"),
  );
  const predictionPlacedEventHash = keccak256(
    toBytes("PredictionPlaced(uint256,uint256,address,uint8,uint256,uint256)"),
  );
  const marketResolvedEventHash = keccak256(
    toBytes("MarketResolved(uint256,uint8,uint256,uint256)"),
  );

  const http = new HTTPCapability();

  return [
    // HTTP Trigger for X402 payment confirmations
    handler(
      http.trigger({
        authorizedKeys: [
          {
            type: "KEY_TYPE_ECDSA_EVM",
            publicKey: config.authorizedEVMAddress,
          },
        ],
      }),
      onHttpTrigger,
    ),
    // Event Log Trigger for all PredictionMarket events (MarketCreated, PredictionPlaced, MarketResolved)
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
        topics: [
          {
            values: [
              hexToBase64(marketCreatedEventHash),
              hexToBase64(predictionPlacedEventHash),
              hexToBase64(marketResolvedEventHash),
            ],
          },
        ],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

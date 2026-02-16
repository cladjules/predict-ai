import {
  EVMClient,
  handler,
  getNetwork,
  type Runtime,
  type EVMLog,
  Runner,
  bytesToHex,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { keccak256, toBytes, decodeEventLog, parseAbi } from "viem";

type Config = {
  chainSelectorName: string;
  tokenAddress: string;
};

const eventAbi = parseAbi([
  "event MarketResolved(uint256 indexed marketId, uint256 winningOptionIndex)",
]);

const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics.map((topic) => bytesToHex(topic)) as [
    `0x${string}`,
    ...`0x${string}`[],
  ];
  const data = bytesToHex(log.data);

  const decodedLog = decodeEventLog({
    abi: eventAbi,
    data,
    topics,
  });

  const { marketId, winningOptionIndex } = decodedLog.args;
  runtime.log(
    `Market resolved: Market ID ${marketId}, Winning Option Index: ${winningOptionIndex}`,
  );

  // TODO: Do Database update here

  return `Processed market resolution for Market ID ${marketId}`;
};

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    // See chain selectors in https://github.com/smartcontractkit/chain-selectors/blob/main/all_selectors.yml
    chainSelectorName: config.chainSelectorName,
    isTestnet: [
      "testnet",
      "sepolia",
      "goerli",
      "rinkeby",
      "ropsten",
      "kovan",
    ].some((testnet) => config.chainSelectorName.includes(testnet)),
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);
  const marketResolvedEventHash = keccak256(
    toBytes("MarketResolved(uint256,uint256)"),
  );

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.tokenAddress)],
        topics: [{ values: [hexToBase64(marketResolvedEventHash)] }],
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

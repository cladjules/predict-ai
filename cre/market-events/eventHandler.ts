import { Runtime, EVMLog, bytesToHex } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import { Config } from "./paymentHandler";

export const eventAbi = parseAbi([
  "event MarketResolved(uint256 indexed marketId, uint8 winningOutcome, uint256 totalPool, uint256 timestamp)",
]);

export const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
  runtime.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Market Resolved Event");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

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

  const { marketId, winningOutcome, totalPool, timestamp } = decodedLog.args;

  runtime.log(`[Event] Market resolved:`);
  runtime.log(`  - Market ID: ${marketId}`);
  runtime.log(`  - Winning Outcome: ${winningOutcome}`);
  runtime.log(`  - Total Pool: ${totalPool}`);
  runtime.log(`  - Timestamp: ${timestamp}`);

  // TODO: Update database with resolution results
  // TODO: Trigger notifications to users
  // TODO: Update market status in backend

  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  return `Processed market resolution for Market ID ${marketId}`;
};

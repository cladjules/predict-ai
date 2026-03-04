#!/usr/bin/env ts-node
/**
 * Check USDC Balances
 *
 * Simple USDC balance checker for the 3 test wallets and contract
 * Run this before and after resolution to verify payouts
 *
 * Usage:
 *   npm run check-data
 */

import path from "path";
import fs from "fs";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

import { config } from "dotenv";
config({ path: path.join(__dirname, "../.env") });

// Get contract address from deployed-contracts.json
const deployedContracts = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../src/deployed-contracts.json"),
    "utf-8",
  ),
);

// Get contract address from deployed-contracts.json
const predictionMarketAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, "PredictionMarket.json"), "utf-8"),
).abi;

const CONTRACT_ADDRESS = deployedContracts["84532"].PredictionMarket;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

const TEST_WALLETS = process.env.TEST_WALLETS?.split(",") || [];

const erc20Abi = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
]);

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

async function checkMarkets() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Markets Check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    const marketCount = (await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "marketCount",
    })) as bigint;

    console.log(`📈 Total Markets: ${marketCount}\n`);

    if (marketCount > 0n) {
      console.log("Markets List:\n");

      for (let i = 0; i < Number(marketCount); i++) {
        const market = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: predictionMarketAbi,
          functionName: "getMarket",
          args: [BigInt(i)],
        })) as {
          id: bigint;
          outcomeCount: number;
          outcomePools: bigint[];
          totalPool: bigint;
          finishesAt: bigint;
          winningOutcome: number;
          isResolved: boolean;
          creator: string;
          paymentToken: string;
          contentHash: string;
        };

        console.log(`Market #${i}:`);
        console.log(`  ID: ${market.id}`);
        console.log(`  Outcome Count: ${market.outcomeCount}`);
        console.log(
          `  Total Pool: ${formatUnits(market.totalPool, 6)} ${market.paymentToken === "0x0000000000000000000000000000000000000000" ? "ETH" : "tokens"}`,
        );
        console.log(
          `  Finishes At: ${new Date(Number(market.finishesAt) * 1000).toLocaleString()}`,
        );
        console.log(
          `  Resolved: ${market.isResolved ? `Yes (Winner: Outcome ${market.winningOutcome})` : "No"}`,
        );
        console.log(`  Creator: ${market.creator}`);
        console.log(`  Payment Token: ${market.paymentToken}`);
        console.log("");
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error: any) {
    console.error(`\n❌ Error checking markets: ${error.message}\n`);
  }
}

async function checkPredictions() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 Predictions Check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    const predictionCount = (await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: predictionMarketAbi,
      functionName: "predictionCount",
    })) as bigint;

    console.log(`🎲 Total Predictions: ${predictionCount}\n`);

    if (predictionCount > 0n) {
      console.log("Predictions List:\n");

      for (let i = 0; i < Number(predictionCount); i++) {
        const prediction = (await client.readContract({
          address: CONTRACT_ADDRESS,
          abi: predictionMarketAbi,
          functionName: "getPrediction",
          args: [BigInt(i)],
        })) as {
          marketId: bigint;
          predictor: string;
          outcome: number;
          amount: bigint;
        };

        console.log(`Prediction #${i}:`);
        console.log(`  Market ID: ${prediction.marketId}`);
        console.log(`  Predictor: ${prediction.predictor}`);
        console.log(`  Outcome: ${prediction.outcome}`);
        console.log(`  Amount: ${formatUnits(prediction.amount, 6)} tokens`);
        console.log("");
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error: any) {
    console.error(`\n❌ Error checking predictions: ${error.message}\n`);
  }
}

async function checkBalances() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💵 USDC Balance Check");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // Check contract balance
    const contractBalance = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [CONTRACT_ADDRESS],
    });

    console.log("📊 Contract Balance:");
    console.log(`   ${CONTRACT_ADDRESS}`);
    console.log(`   ${formatUnits(contractBalance, 6)} USDC\n`);

    // Check test wallet balances
    console.log("🧪 Test Wallet Balances:\n");

    for (let i = 0; i < TEST_WALLETS.length; i++) {
      const wallet = TEST_WALLETS[i];
      const balance = await client.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet as `0x${string}`],
      });

      console.log(`${i + 1}. ${wallet}`);
      console.log(`   ${formatUnits(balance, 6)} USDC\n`);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error: any) {
    console.error(`\n❌ Error checking balances: ${error.message}\n`);
  }
}

async function main() {
  await checkBalances();
  await checkMarkets();
  await checkPredictions();
}

main().catch(console.error);

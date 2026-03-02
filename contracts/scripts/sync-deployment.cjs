#!/usr/bin/env node
/**
 * Sync deployed contract addresses to backend
 * Run this after deploying contracts: npm run sync-deployment
 */
const fs = require("fs");
const path = require("path");

const CHAIN_CONFIGS = {
  8453: { network: "Base Mainnet" },
  84532: { network: "Base Sepolia" },
};

const backendConfigPath = path.join(
  __dirname,
  "../../backend/src/deployed-contracts.json",
);

async function syncDeployment() {
  console.log("🔄 Syncing deployment addresses to backend...\n");

  const backendConfig = {};

  for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
    const deploymentPath = path.join(
      __dirname,
      `../ignition/deployments/chain-${chainId}/deployed_addresses.json`,
    );

    if (fs.existsSync(deploymentPath)) {
      const deploymentData = JSON.parse(
        fs.readFileSync(deploymentPath, "utf-8"),
      );
      const contractAddress =
        deploymentData["PredictionMarketModule#PredictionMarket"];

      if (contractAddress) {
        backendConfig[chainId] = {
          PredictionMarket: contractAddress,
          network: config.network,
        };
        console.log(
          `✅ Chain ${chainId} (${config.network}): ${contractAddress}`,
        );
      } else {
        console.log(
          `⚠️  Chain ${chainId} (${config.network}): No deployment found`,
        );
      }
    } else {
      console.log(
        `⚠️  Chain ${chainId} (${config.network}): Deployment file not found`,
      );
    }
  }

  // Write to backend config
  fs.writeFileSync(
    backendConfigPath,
    JSON.stringify(backendConfig, null, 2) + "\n",
  );

  console.log(`\n✅ Synced deployment addresses to ${backendConfigPath}`);
}

syncDeployment().catch((error) => {
  console.error("❌ Error syncing deployment:", error);
  process.exit(1);
});

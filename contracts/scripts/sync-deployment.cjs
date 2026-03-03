#!/usr/bin/env node
/**
 * Sync deployed contract addresses to backend and CRE configs
 * Run this after deploying contracts: npm run sync-deployment
 *
 * Updates:
 * - backend/deployed-contracts.json
 * - cre/market-admin/config.staging.json (for Base Sepolia)
 * - cre/market-admin/config.production.json (for Base Mainnet)
 * - cre/market-events/config.staging.json (for Base Sepolia)
 * - cre/market-events/config.production.json (for Base Mainnet)
 *
 * Supports both regular and UUPS proxy deployments:
 * - Regular: PredictionMarketModule#PredictionMarket
 * - UUPS Proxy: PredictionMarketModule#ERC1967Proxy
 */
const fs = require("fs");
const path = require("path");

const CHAIN_CONFIGS = {
  8453: { network: "Base Mainnet", env: "production" },
  84532: { network: "Base Sepolia", env: "staging" },
};

const backendConfigPath = path.join(
  __dirname,
  "../../backend/deployed-contracts.json",
);

const CRE_MODULES = ["market-admin", "market-events"];

async function syncDeployment() {
  console.log("🔄 Syncing deployment addresses...\n");

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

      const proxyAddress =
        deploymentData["PredictionMarketModule#ERC1967Proxy"];

      const contractAddress = proxyAddress;

      if (contractAddress) {
        // Update backend config
        backendConfig[chainId] = {
          PredictionMarket: contractAddress,
          network: config.network,
        };
        console.log(
          `✅ Chain ${chainId} (${config.network}): ${contractAddress}`,
        );

        // Update CRE configs
        const environment = config.env; // "staging" or "production"

        for (const module of CRE_MODULES) {
          const creConfigPath = path.join(
            __dirname,
            `../../cre/${module}/config.${environment}.json`,
          );

          if (fs.existsSync(creConfigPath)) {
            const creConfig = JSON.parse(
              fs.readFileSync(creConfigPath, "utf-8"),
            );
            creConfig.contractAddress = contractAddress;
            fs.writeFileSync(
              creConfigPath,
              JSON.stringify(creConfig, null, 2) + "\n",
            );
            console.log(
              `   └─ Updated cre/${module}/config.${environment}.json`,
            );
          }
        }
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

  console.log(`\n✅ Synced to backend/deployed-contracts.json`);
  console.log(`✅ Updated all CRE config files`);
}

syncDeployment().catch((error) => {
  console.error("❌ Error syncing deployment:", error);
  process.exit(1);
});

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import PredictionMarketModule from "./PredictionMarket.js";

/**
 * Upgrade module for PredictionMarket contract
 *
 * Usage:
 * 1. Update the version() function in PredictionMarket.sol (e.g., "1.0.0" -> "1.1.0")
 * 2. Update VERSION below to match
 * 3. Run: npx hardhat ignition deploy ignition/modules/UpgradePredictionMarket.ts --network <network>
 *
 * This module reads the existing proxy address from the previous deployment
 * and upgrades it to a new implementation.
 *
 * Alternative approaches for versioning:
 * - Use env var: const VERSION = process.env.CONTRACT_VERSION || Date.now().toString();
 * - Use git tag: Read from git describe or package.json version
 * - Use timestamp: const VERSION = new Date().toISOString().split('T')[0].replace(/-/g, '');
 */
const UpgradePredictionMarketModule = buildModule(
  "UpgradePredictionMarketModule",
  (m) => {
    // Version identifier - update this with each upgrade
    // Should match the version() function in the contract
    const VERSION = "1.1.0"; // Change this for each upgrade

    // Import the existing proxy from the previous deployment
    // Hardhat Ignition automatically tracks deployed addresses
    const { proxy } = m.useModule(PredictionMarketModule);

    // Deploy the new implementation contract
    const newImplementation = m.contract("PredictionMarket", [], {
      id: `PredictionMarket_v${VERSION.replace(/\./g, "_")}`, // e.g., PredictionMarket_v1_1_0
    });

    // Get the proxy as the upgradeable contract interface
    const proxyAsContract = m.contractAt("PredictionMarket", proxy);

    // Call upgradeToAndCall to upgrade the proxy to the new implementation
    // We use upgradeToAndCall with empty data (no re-initialization needed)
    m.call(proxyAsContract, "upgradeToAndCall", [newImplementation, "0x"]);

    return {
      newImplementation,
      proxy,
    };
  },
);

export default UpgradePredictionMarketModule;

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for PredictionMarket contract using UUPS proxy
 */
const PredictionMarketModule = buildModule("PredictionMarketModule", (m) => {
  // Forwarder addresses for CRE here: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
  const creForwarders: Record<string, string> = {
    base: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    // Actual Production forwarder, for now, we need to use the mock below for simulation
    // baseSepolia: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    baseSepolia: "0x82300bd7c3958625581cc2f77bc6464dcecdf3e5",
  };

  const networkName = process.env.HARDHAT_NETWORK ?? "";

  const forwarderAddress = creForwarders[networkName];
  if (!forwarderAddress) {
    throw new Error(`No CRE forwarder configured for network: ${networkName}`);
  }

  // Deploy the implementation contract
  const predictionMarketImpl = m.contract("PredictionMarket");

  // Encode the initialize function call
  const initializeData = m.encodeFunctionCall(
    predictionMarketImpl,
    "initialize",
    [forwarderAddress],
  );

  // Deploy the ERC1967Proxy
  const predictionMarket = m.contract("ERC1967Proxy", [
    predictionMarketImpl,
    initializeData,
  ]);

  return { proxy: predictionMarket, implementation: predictionMarketImpl };
});

export default PredictionMarketModule;

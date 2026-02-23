import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for PredictionMarket contract
 *
 * This contract supports both ETH and ERC20 tokens (like USDC).
 * Markets are created with a payment token address:
 * - address(0) for native ETH
 * - Token address for ERC20 (e.g., USDC)
 *
 * Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * Base Mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

const PredictionMarketModule = buildModule("PredictionMarketModule", (m) => {
  const predictionMarket = m.contract("PredictionMarket");

  return { predictionMarket };
});

export default PredictionMarketModule;

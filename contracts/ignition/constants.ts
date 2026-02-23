/**
 * Deployment constants for prediction markets on different networks
 */

export const NETWORK_CONFIGS = {
  // Base Sepolia Testnet (chainId: 84532)
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Official USDC on Base Sepolia
    explorer: "https://sepolia.basescan.org",
  },
  // Base Mainnet (chainId: 8453)
  base: {
    chainId: 8453,
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Official USDC on Base
    explorer: "https://basescan.org",
  },
  // Ethereum Sepolia (chainId: 11155111)
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
    explorer: "https://sepolia.etherscan.io",
  },
} as const;

export type NetworkName = keyof typeof NETWORK_CONFIGS;

export function getUSDCAddress(network: NetworkName): string {
  return NETWORK_CONFIGS[network].usdc;
}

export function getExplorerUrl(network: NetworkName): string {
  return NETWORK_CONFIGS[network].explorer;
}

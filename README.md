# Predict AI

AI-powered prediction market platform that generates and resolves prediction markets using Claude AI and integrates with Chainlink CRE for secure on-chain reporting.

> **Built for Convergence | A Chainlink Hackathon 2026**  
> This project is built entirely on Chainlink Runtime Environment (CRE) workflows, showcasing autonomous AI-powered oracle capabilities.

## Overview

Predict AI is a complete prediction market platform combining:

- **Smart Contracts** - UUPS upgradeable contracts for on-chain prediction markets with USDC support
- **Backend Server** - Express.js API with X402 crypto payments and MongoDB storage
- **CRE Workflows** - Autonomous Chainlink workflows for market generation, resolution, and event processing

Users submit predictions via crypto payments (USDC), Claude AI generates and resolves markets autonomously, and all data is secured on-chain via Chainlink's decentralized oracle network.

## Architecture

```
┌─────────────┐
│   Users     │
│  (Browser)  │
└──────┬──────┘
       │
       │ X402 Payment (USDC)
       │
       ▼
┌──────────────────────────────────────────┐
│            Backend Server                 │
│  - X402 Payment Integration              │
│  - Database API (MongoDB)                │
│  - Market & Prediction Storage           │
└──────┬───────────────────────────────────┘
       │
       │ REST API
       │
       ▼
┌──────────────────────────────────────────┐
│        Chainlink CRE Workflows           │
│                                          │
│  ┌────────────────┐  ┌────────────────┐ │
│  │ market-admin   │  │ market-events  │ │
│  │ (Scheduled)    │  │ (Event-driven) │ │
│  │                │  │                │ │
│  │ • Generate     │  │ • Payments     │ │
│  │   Markets      │  │ • Blockchain   │ │
│  │   (Claude AI)  │  │   Events       │ │
│  │ • Resolve      │  │ • On-chain     │ │
│  │   Markets      │  │   Recording    │ │
│  │   (Claude AI)  │  │                │ │
│  └────────────────┘  └────────────────┘ │
└──────┬───────────────────────────────────┘
       │
       │ Keystone Forwarder
       │
       ▼
┌──────────────────────────────────────────┐
│     PredictionMarket Contract (Base)     │
│  - UUPS Upgradeable                      │
│  - ETH & ERC20 (USDC) Support            │
│  - Proportional Payouts                  │
│  - Time-bounded Markets                  │
└──────────────────────────────────────────┘
```

## Components

### 📜 [Smart Contracts](contracts/README.md)

Solidity contracts for the prediction market platform.

- **UUPS upgradeable proxy pattern** for contract upgradeability
- **Multi-token support**: ETH and ERC20 (USDC) markets
- **Automatic proportional payouts** to winners
- **Chainlink CRE integration** for secure oracle reporting

**Quick Start:**

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
npm run deploy:baseSepolia
```

[📖 Full Contracts Documentation](contracts/README.md)

### 🔌 [Backend Server](backend/README.md)

Express.js server handling payments and data storage.

- **X402 crypto payment integration** with USDC support
- **MongoDB database** for markets and predictions
- **REST API** for CRE workflows
- **Payment verification** and blockchain settlement

**Quick Start:**

```bash
cd backend
npm install
cp .env.example .env
# Configure .env with required variables
npm run dev
```

[📖 Full Backend Documentation](backend/README.md)

### ⚡ [Chainlink CRE Workflows](cre/README.md)

Autonomous workflows for market lifecycle management.

**market-admin** (Scheduled):

- Generate markets using Claude AI
- Check and resolve markets using Claude AI
- Automated market lifecycle

**market-events** (Event-driven):

- Process X402 payment notifications
- Monitor blockchain events
- Forward reports to Keystone Forwarder

**Quick Start:**

```bash
cd cre/market-admin
npm install
npm run simulate

cd ../market-events
npm install
npm run simulate
```

[📖 Full CRE Workflows Documentation](cre/README.md)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB instance
- Base Sepolia ETH (for testnet)
- Claude API key (Anthropic)
- Chainlink CRE CLI

### Installation

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd predict-ai
   ```

2. **Install dependencies:**

   ```bash
   npm install
   cd contracts && npm install && cd ..
   cd backend && npm install && cd ..
   cd cre/market-admin && npm install && cd ../..
   cd cre/market-events && npm install && cd ../..
   ```

3. **Configure environment:**

   ```bash
   # Backend
   cd backend
   cp .env.example .env
   # Edit .env with your configuration

   # CRE
   cd ../cre
   # Edit secrets.yaml with your API keys
   ```

4. **Deploy contracts:**

   ```bash
   cd contracts
   npm run deploy:baseSepolia
   npm run sync-deployment
   ```

5. **Start backend:**

   ```bash
   cd backend
   npm run dev
   ```

6. **Deploy CRE workflows:**

   ```bash
   cd cre/market-admin
   npm run deploy

   cd ../market-events
   npm run deploy
   ```

## Development Workflow

### Local Testing

1. **Test contracts:**

   ```bash
   cd contracts
   npx hardhat test
   ```

2. **Test backend:**

   ```bash
   cd backend
   npm run dev
   ```

3. **Simulate CRE workflows:**

   ```bash
   cd cre/market-admin
   npm run simulate

   cd ../market-events
   npm run simulate
   ```

## Project Structure

```
predict-ai/
├── contracts/              # Solidity smart contracts
│   ├── contracts/          # Contract source files
│   ├── ignition/           # Hardhat Ignition deployment modules
│   ├── scripts/            # Deployment and utility scripts
│   └── test/               # Contract tests
├── backend/                # Express.js backend server
│   ├── src/                # Source files
│   │   ├── index.ts        # Main server file
│   │   ├── dbRoutes.ts     # Database API routes
│   │   ├── paymentRoutes.ts# X402 payment routes
│   │   └── models.ts       # MongoDB schemas
│   └── scripts/            # Utility scripts
├── cre/                    # Chainlink CRE workflows
│   ├── market-admin/       # Scheduled market generation/resolution
│   │   ├── main.ts
│   │   ├── generationHandler.ts
│   │   ├── resolutionHandler.ts
│   │   └── workflow.yaml
│   ├── market-events/      # Event-driven payment/event handler
│   │   ├── main.ts
│   │   ├── paymentHandler.ts
│   │   ├── eventHandler.ts
│   │   └── workflow.yaml
│   ├── project.yaml        # CRE project configuration
│   └── secrets.yaml        # Secret mappings
└── README.md               # This file
```

## Key Features

✅ **AI-Powered Market Generation** - Claude AI creates interesting prediction markets autonomously  
✅ **AI-Powered Resolution** - Claude AI researches and resolves markets based on real-world outcomes  
✅ **Crypto Payments** - X402 paywall with USDC support on Base L2  
✅ **Decentralized Oracle** - Chainlink CRE for secure on-chain reporting  
✅ **Upgradeable Contracts** - UUPS proxy pattern for contract evolution  
✅ **Multi-Token Support** - ETH and ERC20 (USDC) markets  
✅ **Proportional Payouts** - Fair winner distribution based on stake  
✅ **Event-Driven Architecture** - Real-time payment and blockchain event processing

## Networks

### Testnet (Base Sepolia)

- Chain ID: 84532
- RPC: https://sepolia.base.org
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### Mainnet (Base)

- Chain ID: 8453
- RPC: https://mainnet.base.org
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Explorer: https://basescan.org

## Documentation

- [Contracts Documentation](contracts/README.md) - Smart contract deployment, testing, and usage
- [Backend Documentation](backend/README.md) - API endpoints, environment setup, and architecture
- [CRE Workflows Documentation](cre/README.md) - Workflow deployment, configuration, and monitoring

## License

MIT

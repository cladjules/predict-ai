# Predict AI CRE Workflows

AI-powered prediction market platform with Chainlink CRE integration.

## Architecture Overview

This project uses **2 consolidated Chainlink Runtime Environment (CRE) workflows**:

### 1. **market-admin/** - Administrative Operations (Scheduled)

Handles scheduled market lifecycle management:

- **Market Generation**: AI-powered market creation using Claude AI (every hour in staging, every 12 hours in production)
- **Market Resolution**: Automated outcome verification using Claude AI (every 30 minutes in staging, every hour in production)

### 2. **market-events/** - Event-Driven Operations

Handles real-time user interactions and blockchain events:

- **Payment Received**: HTTP trigger from X402 payment platform to record predictions on-chain
- **Market Resolved**: Blockchain event listener for MarketResolved events to update database

## Project Structure

```
cre/
├── market-admin/          # Consolidated: generation + resolution
│   ├── main.ts           # Dual cron triggers for admin tasks
│   ├── utils.ts          # HTTP client utilities
│   ├── config.*.json     # Scheduling and mock markets
│   └── workflow.yaml     # CRE workflow configuration
│
├── market-events/         # Consolidated: payments + events
│   ├── main.ts           # HTTP trigger + blockchain event listener
│   ├── config.*.json     # Chain, contract, and auth settings
│   └── workflow.yaml     # CRE workflow configuration
│
├── shared/               # Shared utilities
│   ├── types.ts          # PredictionMarket type definitions
│   └── utils.ts          # Network configuration helpers
│
├── project.yaml          # CRE project configuration (RPCs)
└── secrets.yaml          # Secret names mapping
```

## Getting Started

### Prerequisites

1. Install CRE CLI (Chainlink Runtime Environment):

   ```bash
   npm install -g @chainlink/cre-cli
   ```

2. Install dependencies for each workflow:
   ```bash
   cd market-admin && npm install
   cd ../market-events && npm install
   ```

### Configuration

#### market-admin Workflow

Edit `market-admin/config.staging.json`:

```json
{
  "generationSchedule": "0 0 * * * *",      // Cron: every hour
  "resolutionSchedule": "0 30 * * * *",     // Cron: every 30 minutes
  "mockMarkets": [...]                       // Test markets for staging
}
```

#### market-events Workflow

Edit `market-events/config.staging.json`:

```json
{
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "contractAddress": "0x...", // PredictionMarket contract
  "publicKey": "0x..." // X402 backend public key
}
```

#### Secrets

Set your Claude API key:

```bash
cre secrets set CLAUDE_API_KEY_ALL "your-api-key-here"
```

### Simulate Workflows

Run simulations from the project root directory:

```bash
# Simulate market admin workflow (generation + resolution)
cre workflow simulate market-admin

# Simulate market events workflow (payments + events)
cre workflow simulate market-events
```

### Deploy Workflows

Deploy to staging or production:

```bash
# Deploy market-admin workflow to staging
cd market-admin
cre workflow deploy staging-settings

# Deploy market-events workflow to staging
cd ../market-events
cre workflow deploy staging-settings
```

## Workflow Details

### market-admin Workflow

**Triggers**: Dual cron schedules

- Generation: Creates 10 diverse prediction markets using Claude AI
- Resolution: Verifies completed markets and triggers on-chain resolution

**Configuration**:

- `generationSchedule`: Cron expression for market generation
- `resolutionSchedule`: Cron expression for resolution checks
- `mockMarkets`: Array of test markets (staging only)

**Secrets**: `CLAUDE_API_KEY`

### market-events Workflow

**Triggers**: HTTP + Blockchain Events

- **HTTP Trigger**: Receives X402 payment confirmations, records predictions on-chain
  - Authorization: ECDSA EVM public key validation
  - Encodes 5 parameters: predictor, marketId, outcome, amount, paymentToken
  - Calls PredictionMarket.onReport() via KeystoneForwarder

- **Event Listener**: Listens for MarketResolved events
  - Confidence level: Finalized blocks only
  - Updates database with resolution results
  - Triggers notifications (TODO)

**Configuration**:

- `chainSelectorName`: Base Sepolia chain selector
- `contractAddress`: Deployed PredictionMarket contract address
- `publicKey`: X402 backend public key for HTTP authentication

## Integration Flow

### Prediction Flow (market-events)

1. User pays via X402 (ETH/USDC on Base Sepolia)
2. X402 backend sends HTTP request to market-events workflow
3. CRE encodes prediction data and generates report
4. Report sent to PredictionMarket contract via KeystoneForwarder
5. Smart contract validates and records prediction on-chain

### Resolution Flow (market-admin)

1. Cron trigger executes resolution check
2. Fetches completed markets from database
3. Claude AI verifies outcomes from verification URLs
4. Triggers on-chain resolution (TODO)
5. Event listener captures MarketResolved event
6. Database updated with final results

## Migration Notes

**Consolidated from 4 workflows to 2:**

- ✅ `market-generation` + `market-resolution-checks` → `market-admin`
- ✅ `market-payment-received` + `market-event-log` → `market-events`

**Benefits:**

- Simplified deployment and monitoring
- Clear separation: admin vs user operations
- Independent scaling of payment/event traffic
- Reduced configuration overhead

## Git Repository

```
git@github.com:cladjules/predict-ai.git
```

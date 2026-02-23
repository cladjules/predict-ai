# Market Events Workflow

Consolidated workflow for event-driven market operations.

## Features

### Payment Received (HTTP Trigger)

- **Trigger**: HTTP request from X402 payment platform
- **Function**: Records prediction on-chain after payment confirmation
- **Authorization**: Public key validation (ECDSA EVM)
- **Data Flow**: X402 → HTTP Trigger → CRE Report → PredictionMarket.onReport()

### Market Resolved (Blockchain Event)

- **Trigger**: MarketResolved event from PredictionMarket contract
- **Function**: Updates database with resolution results
- **Confidence**: Finalized blocks only
- **Data Flow**: Smart Contract → Event Log → Database Update

## Configuration

### Network Settings

- `chainSelectorName`: Chain selector name (e.g., "ethereum-testnet-sepolia-base-1")
- `contractAddress`: PredictionMarket contract address
- `publicKey`: Authorized public key for HTTP requests (X402 backend)

### Security

- HTTP trigger requires authorized public key signature
- Event listener waits for finalized confidence level
- All reports are consensus-validated by DON

## Deployment

```bash
# Configure publicKey and contractAddress in config files first!

# Deploy to staging
cre workflow deploy staging-settings

# Deploy to production
cre workflow deploy production-settings
```

## Configuration Steps

1. Update `config.staging.json` and `config.production.json` with:
   - `contractAddress`: Deployed PredictionMarket contract address
   - `publicKey`: X402 backend public key for HTTP authentication

2. Ensure X402 backend is configured to send prediction data to the CRE HTTP endpoint

3. Verify the workflow is listening for MarketResolved events

## Data Format

### HTTP Trigger Input (from X402)

```json
{
  "marketId": "1",
  "predictor": "0x123...",
  "outcome": 0,
  "amount": "1000000000000000000",
  "paymentToken": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "x402TxHash": "0xabc..."
}
```

### Event Log Output (from blockchain)

```typescript
{
  marketId: bigint,
  winningOutcome: number,
  totalPool: bigint,
  timestamp: bigint
}
```

## TODO

- Implement database update for resolved markets
- Add notification system for market resolution
- Add monitoring and alerting for failed predictions
- Implement retry logic for failed HTTP requests

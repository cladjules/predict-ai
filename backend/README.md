# X402 Crypto Payment Server + Database API

Express.js server with two main components:

1. **X402 Payment Integration** - Crypto paywall and USDC payments (Base Sepolia / Base)
2. **Database API** - MongoDB storage for markets and predictions, accessed by CRE workflows

## Quickstart

```bash
cd backend
npm install
cp .env.example .env
# Configure required environment variables in .env:
#   - WALLET_RECIPIENT_ADDRESS: Your EVM wallet address
#   - WALLET_PRIVATE_KEY: Your wallet private key
#   - NETWORK: eip155:84532 (Base Sepolia) or eip155:8453 (Base)
#   - MONGODB_URI: Your MongoDB connection string
#   - API_KEY: Secure key for CRE workflows to access API
npm run dev
```

Server starts at `http://localhost:4021`

## Features

### X402 Payment Routes

- `GET /` - Interactive form UI for submitting predictions
- `GET /predict` - Protected prediction endpoint with paywall
- `POST /predict` - API endpoint for predictions (no paywall)
- Automatic payment verification and blockchain settlement
- Integration with Chainlink CRE workflows

### Database API Routes (Protected)

All `/api/*` routes for managing markets and predictions:

**Public (No Auth Required):**

- `GET /api/markets` - Fetch all markets with predictions
- `GET /api/markets/:marketId` - Fetch specific market
- `GET /api/markets/active` - Fetch active markets that can be resolved now

**Protected (Requires x-api-key header):**

- `POST /api/markets` - Create new market
- `POST /api/markets/:marketId/predictions` - Add prediction
- `POST /api/markets/:marketId/resolve` - Resolve market

See [API.md](./API.md) for complete API documentation.

## Environment Variables

| Variable                   | Description                      | Required |
| -------------------------- | -------------------------------- | -------- |
| `WALLET_RECIPIENT_ADDRESS` | EVM wallet to receive payments   | Yes      |
| `WALLET_PRIVATE_KEY`       | Private key for signing          | Yes      |
| `NETWORK`                  | EIP-155 chain ID (84532 or 8453) | Yes      |
| `MONGODB_URI`              | MongoDB connection string        | Yes      |
| `API_KEY`                  | API key for CRE workflows        | Yes      |
| `FACILITATOR_URL`          | X402 facilitator URL             | Yes      |
| `CRE_TRIGGER_URL`          | Chainlink CRE gateway URL        | Optional |
| `CRE_WORKFLOW_ID`          | CRE workflow ID                  | Optional |
| `PORT`                     | Server port (default: 4021)      | No       |
| `SIMULATE`                 | Skip blockchain calls (dev mode) | No       |

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │─────▶│  X402 Server │─────▶│  MongoDB    │
│   (User)    │◀─────│  (Backend)   │◀─────│  Database   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │                      ▲
                            │                      │
                            ▼                      │
                     ┌──────────────┐             │
                     │ CRE Workflows│─────────────┘
                     │  (Chainlink) │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Contract   │
                     │  (Base L2)   │
                     └──────────────┘
```

## Development

```bash
# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Production
npm start
```

See `src/` for source code:

- `index.ts` - Main server with X402 payment routes
- `dbRoutes.ts` - Database API routes
- `models.ts` - Mongoose schemas for Market and Prediction
- `middleware.ts` - API key authentication middleware
- `utils.ts` - JWT utilities for CRE

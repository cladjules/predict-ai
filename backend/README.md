# Backend Server

Express.js server with two main components:

1. **X402 Payment Integration** - Crypto paywall and USDC payments (Base Sepolia / Base)
2. **Database API** - MongoDB storage for markets and predictions, accessed by CRE workflows

## Quickstart

```bash
cd backend
npm install
cp .env.example .env
# Configure required environment variables in .env:
#   - WALLET_PRIVATE_KEY: Your wallet private key
#   - NETWORK: eip155:84532 (Base Sepolia) or eip155:8453 (Base)
#   - MONGODB_URI: Your MongoDB connection string
#   - API_KEY: Secure key for CRE workflows to access API
#   - FACILITATOR_URL: X402 facilitator URL
npm run dev
```

Server starts at `http://localhost:4021`

## Features

### X402 Payment Routes

User-facing endpoints for placing predictions with crypto payments:

- `GET /` - Interactive form UI for submitting predictions
- `GET /predict` - Protected prediction endpoint with paywall
- `POST /predict` - API endpoint for predictions (no paywall)
- Automatic payment verification and blockchain settlement
- USDC payment support on Base Sepolia and Base Mainnet

### Database API Routes

REST API for CRE workflows to manage markets and predictions:

**Public (No Auth Required):**

- `GET /api/markets` - Fetch all markets with predictions
- `GET /api/market/:marketId` - Fetch specific market
- `GET /api/markets/active` - Fetch active markets ready for resolution

**Protected (Requires `x-api-key` header):**

- `POST /api/markets` - Create new market
- `POST /api/market/:marketId/predictions` - Add prediction to market
- `POST /api/market/:marketId/resolve` - Resolve market with outcome

## Environment Variables

| Variable             | Description                                          | Required |
| -------------------- | ---------------------------------------------------- | -------- |
| `WALLET_PRIVATE_KEY` | Private key for signing transactions                 | Yes      |
| `NETWORK`            | EIP-155 chain ID (eip155:84532 or eip155:8453)       | Yes      |
| `MONGODB_URI`        | MongoDB connection string                            | Yes      |
| `API_KEY`            | API key for CRE workflows to access protected routes | Yes      |
| `FACILITATOR_URL`    | X402 facilitator URL                                 | Yes      |
| `CRE_TRIGGER_URL`    | Chainlink CRE gateway URL for market-events workflow | Optional |
| `CRE_WORKFLOW_ID`    | CRE workflow ID for market-events trigger            | Optional |
| `PORT`               | Server port (default: 4021)                          | No       |
| `SIMULATE_CRE`       | Skip CRE calls (dev mode)                            | No       |

## Architecture

The backend serves as the central data layer between users, CRE workflows, and the blockchain:

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │─────▶│   Backend    │─────▶│  MongoDB    │
│   (User)    │◀─────│  (Express)   │◀─────│  Database   │
└─────────────┘      └──────────────┘      └─────────────┘
                            ▲                      ▲
                            │                      │
                   X402 Payment                    │
                            │                      │
                            ▼                      │
                     ┌──────────────┐             │
                     │     CRE      │─────────────┘
                     │  Workflows   │
                     └──────────────┘
                        │        │
              ┌─────────┘        └─────────┐
              ▼                            ▼
       ┌─────────────┐            ┌─────────────┐
       │market-admin │            │market-events│
       │  (Claude)   │            │  (Trigger)  │
       └─────────────┘            └─────────────┘
              │                            │
              └────────────┬───────────────┘
                           ▼
                    ┌──────────────┐
                    │   Contract   │
                    │  (Base L2)   │
                    └──────────────┘
```

**Flow:**

1. Users submit predictions via X402 payment (USDC)
2. Backend stores predictions in MongoDB
3. CRE `market-admin` workflow generates markets via Claude AI
4. CRE `market-events` workflow processes payments and on-chain events
5. Both workflows interact with blockchain contracts for on-chain recording

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

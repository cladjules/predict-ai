# Backend API Documentation

## Overview

The backend provides two main types of functionality:

1. **X402 Payment Routes** - Handle crypto payments for predictions (in `index.ts`)
2. **Database API Routes** - CRUD operations for markets and predictions (in `dbRoutes.ts`)

## Authentication

**All creation routes (POST) require API key authentication:**

- Header: `x-api-key: <your-api-key>`
- GET routes do NOT require authentication

Protected routes:

- `POST /api/markets` - Create market
- `POST /api/markets/:marketId/predictions` - Add prediction
- `POST /api/markets/:marketId/resolve` - Resolve market

## Database API Routes

All database routes are prefixed with `/api`.

### Markets

#### Create a Market

```http
POST /api/markets
Content-Type: application/json
x-api-key: secure_key

{
  "marketId": "market_001",
  "question": "Will Bitcoin reach $100k by end of 2026?",
  "description": "Optional description",
  "outcomes": ["Yes", "No"]
}
```

**Response (201):**

```json
{
  "success": true,
  "market": {
    "marketId": "market_001",
    "question": "Will Bitcoin reach $100k by end of 2026?",
    "description": "Optional description",
    "outcomes": ["Yes", "No"],
    "status": "active",
    "createdAt": "2026-02-27T...",
    "updatedAt": "2026-02-27T..."
  }
}
```

#### Get All Markets

```http
GET /api/markets
```

**Response (200):**

```json
{
  "success": true,
  "count": 2,
  "markets": [
    {
      "marketId": "market_001",
      "question": "Will Bitcoin reach $100k by end of 2026?",
      "outcomes": ["Yes", "No"],
      "status": "active",
      "predictions": [
        {
          "marketId": "market_001",
          "payer": "0x123...",
          "outcomeIndex": 0,
          "amount": 1.5,
          "paymentToken": "0x036...",
          "x402TxHash": "0xabc...",
          "timestamp": "2026-02-27T..."
        }
      ]
    }
  ]
}
```

#### Get Specific Market

```http
GET /api/markets/:marketId
```

**Response (200):**

```json
{
  "success": true,
  "market": {
    "marketId": "market_001",
    "question": "Will Bitcoin reach $100k by end of 2026?",
    "outcomes": ["Yes", "No"],
    "status": "active",
    "predictions": [...]
  }
}
```

### Predictions

#### Add a Prediction (Manual)

```http
POST /api/markets/:marketId/predictions
Content-Type: application/json
x-api-key: secure_key

{
  "payer": "0x123...",
  "outcomeIndex": 0,
  "amount": 1.5,
  "paymentToken": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "x402TxHash": "0xabc..."
}
```

**Response (201):**

```json
{
  "success": true,
  "prediction": {
    "marketId": "market_001",
    "payer": "0x123...",
    "outcomeIndex": 0,
    "amount": 1.5,
    "paymentToken": "0x036...",
    "x402TxHash": "0xabc...",
    "timestamp": "2026-02-27T..."
  }
}
```

**Note:** Predictions are automatically saved when users pay through the `/predict` route.

### Market Resolution

#### Resolve a Market

```http
POST /api/markets/:marketId/resolve
Content-Type: application/json
x-api-key: secure_key

{
  "resolvedOutcome": 0
}
```

**Response (200):**

```json
{
  "success": true,
  "market": {
    "marketId": "market_001",
    "question": "Will Bitcoin reach $100k by end of 2026?",
    "outcomes": ["Yes", "No"],
    "resolvedOutcome": 0,
    "status": "resolved",
    ...
  }
}
```

## X402 Payment Routes

These routes require crypto payment via the X402 protocol.

### Submit Prediction with Payment

```http
GET /predict?marketId=market_001&outcomeIndex=0&amount=1.5
```

- Opens paywall UI for browser users
- After payment, saves prediction to database automatically

```http
POST /predict
Content-Type: application/json
X-Payment: <base64-encoded-payment>

{
  "marketId": "market_001",
  "outcomeIndex": 0,
  "amount": 1.5
}
```

- For API clients with X402 payment header
- Triggers CRE workflow
- Saves to database on success

## Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# X402 Payment
WALLET_RECIPIENT_ADDRESS=0x...
WALLET_PRIVATE_KEY=0x...
NETWORK=eip155:84532
PAYMENT_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# CRE Workflow
CRE_TRIGGER_URL=https://...
CRE_WORKFLOW_ID=...

# Server
PORT=4021
SIMULATE=true
```

## Running the Server

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Testing Examples

```bash
# Create a market
curl -X POST http://localhost:4021/api/markets \
  -H "Content-Type: application/json" \
  -H "x-api-key: secure_key" \
  -d '{
    "marketId": "test_001",
    "question": "Will it rain tomorrow?",
    "outcomes": ["Yes", "No"]
  }'

# Get all markets
curl http://localhost:4021/api/markets

# Resolve a market
curl -X POST http://localhost:4021/api/markets/test_001/resolve \
  -H "Content-Type: application/json" \
  -H "x-api-key: secure_key" \
  -d '{"resolvedOutcome": 0}'
```

# X402 Crypto Payment Server

Express.js server integrating Coinbase X402 for crypto paywall and USDC payments (Base Sepolia / Base).

## Quickstart

```bash
cd backend/test-x402
npm install
cp .env.example .env
# configure .env (WALLET_ADDRESS, NETWORK, FACILITATOR_URL)
# optionally set CRE_TRIGGER_URL, CRE_SERVICE_ACCOUNT_EMAIL, CRE_SERVICE_ACCOUNT_PRIVATE_KEY
npm run dev
```

## Features

- Paywall middleware for protecting routes
- USDC payments on Base Sepolia and Base mainnet
- Demo endpoints: `/weather`, `/predict`

See `src/` for server code and `src/index.ts` for middleware configuration.

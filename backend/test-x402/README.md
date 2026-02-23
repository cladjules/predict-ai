# X402 Crypto Payment Server

Express.js server integrating Coinbase X402 for crypto paywall and USDC payments (Base Sepolia / Base).

Quickstart
----------

```bash
cd backend/test-x402
npm install
cp .env.example .env
# configure .env (WALLET_ADDRESS, NETWORK, FACILITATOR_URL)
npm run dev
```

Features
--------

- Paywall middleware for protecting routes
- USDC payments on Base Sepolia and Base mainnet
- Demo endpoints: `/weather`, `/predict`

See `src/` for server code and `src/index.ts` for middleware configuration.

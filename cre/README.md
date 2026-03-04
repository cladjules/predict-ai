# Predict AI CRE Workflows

Chainlink Runtime Environment workflows for Predict AI: administrative schedules and event-driven handlers.

## Quickstart

```bash
cd cre/market-admin
npm install
npm run simulate

cd ../market-events
npm install
npm run simulate
```

## 🧪 End-to-End Testing

Comprehensive E2E testing suite for the complete market lifecycle:

```bash
cd cre
npm install

# Quick test flow
npm run create-market          # Create test market
npm run list-markets           # View active markets
npm run test:e2e generate-payment <marketId> <outcome> <amount> <wallet>
npm run check-data         # Check USDC balances (3 wallets + contract)
npm run resolve-bypass         # Resolve all active markets (outcome 0)
npm run check-data         # Verify payouts
```

📖 **Full Testing Guide:** [E2E-TESTING.md](E2E-TESTING.md)  
⚡ **Quick Reference:** [QUICK-REFERENCE.md](QUICK-REFERENCE.md)

## Structure

- `market-admin/` — scheduled market generation and resolution checks (Claude AI)
- `market-events/` — HTTP trigger for payments and on-chain event listeners
- `project.yaml`, `secrets.yaml` — CRE project configuration and secrets mapping
- `e2e-test.ts` — CLI for end-to-end testing
- `check-data.ts` — Simple USDC balance checker (3 wallets + contract)

## Deploy & Simulate

Use the provided npm scripts to simulate workflows locally (`npm run simulate`) and `cre workflow deploy` or `npm run deploy` to deploy. Configure `config.staging.json` / `config.production.json` per workflow before deploying.

## Manual Market Resolution (Testing)

For testing purposes, you can bypass Claude and resolve all active markets with outcome 0:

```bash
npm run resolve-bypass
```

This sets `FORCE_RESOLVE=true` and resolves all active markets with the first outcome.

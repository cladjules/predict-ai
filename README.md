# Predict AI

AI-powered prediction market platform that generates and resolves prediction markets using Claude AI and integrates with Chainlink CRE for secure on-chain reporting.

# Predict AI

AI-powered prediction market platform that generates and resolves prediction markets using Claude AI and integrates with Chainlink CRE for secure on-chain reporting.

## Quickstart

Install top-level dependencies and subproject deps:

```bash
npm install
cd cre/market-admin && npm install
cd ../market-events && npm install
cd ../../backend/test-x402 && npm install
```

Compile contracts and run tests:

```bash
cd contracts
npx hardhat compile
npx hardhat test
```

## Repository layout

- `contracts/` — Solidity contracts, tests and Hardhat config
- `cre/` — Chainlink CRE workflows (market-admin, market-events)
- `backend/` — X402 payment server and integration code
- `frontend/` — Web UI for interacting with markets

See each subfolder's `README.md` for service-specific setup and commands.

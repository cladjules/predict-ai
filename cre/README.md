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

## Structure

- `market-admin/` — scheduled market generation and resolution checks (Claude AI)
- `market-events/` — HTTP trigger for payments and on-chain event listeners
- `project.yaml`, `secrets.yaml` — CRE project configuration and secrets mapping

## Deploy & Simulate

Simulation & Deployment
-----------------------

Use the provided npm scripts to simulate workflows locally (`npm run simulate`) and `cre workflow deploy` or `npm run deploy` to deploy. Configure `config.staging.json` / `config.production.json` per workflow before deploying.

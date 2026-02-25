# Market Admin Workflow

Scheduled administration workflow: market generation and resolution checks using Claude AI.

## Quickstart

```bash
cd cre/market-admin
npm install
npm run simulate    # run staging simulation
npm run deploy      # deploy staging
npm run deploy:prod # deploy production
```

## Configuration

- `config.staging.json` and `config.production.json` contain schedules and mock data.
- `CLAUDE_API_KEY` should be set via `cre secrets` or environment variables.

See `workflow.yaml` for CRE configuration and `main.ts` for trigger logic.

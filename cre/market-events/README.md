# Market Events Workflow

Event-driven workflow handling payments and on-chain events.

Quickstart
----------

```bash
cd cre/market-events
npm install
npm run simulate    # run staging simulation
npm run deploy      # deploy staging
npm run deploy:prod # deploy production
```

Configuration
-------------

- `config.staging.json` and `config.production.json` contain `chainSelectorName`, `contractAddress`, and `authorizedEVMAddress`.
- The HTTP trigger authenticates X402 payment notifications before forwarding reports to the KeystoneForwarder.

Data formats and example payloads are in the workflow directory. Ensure `contractAddress` is set before deploying.

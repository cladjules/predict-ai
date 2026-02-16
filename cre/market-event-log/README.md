# Market Event log workflow

This workflow will mark the market as resolved in the Database once the event Log has been received.

## 1. Update .env file

You need to add a private key to env file. This is required to write to the contract.

```
CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

## 2. Install dependencies

If `bun` is not already installed, see https://bun.com/docs/installation for installing in your environment.

```bash
cd market-event-log && npm install
```

## 3. Simulate the workflow

Run the command from <b>project root directory</b>

```bash
cre workflow simulate ./market-event-log --target=staging-settings
```

# Market Resolution checks workflow

This workflow will check the database for markets that has ended, will use Claude AI for resolution and update the contracts. Database is updated separately.

## 1. Update .env file

You need to add a private key to env file. This is required to write to the contract.

```
CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
CLAUDE_API_KEY_ALL=sk........
```

## 2. Install dependencies

If `bun` is not already installed, see https://bun.com/docs/installation for installing in your environment.

```bash
cd market-resolution-checks && npm install
```

## 3. Simulate the workflow

Run the command from <b>project root directory</b>

```bash
cre workflow simulate ./market-resolution-checks --target=staging-settings
```

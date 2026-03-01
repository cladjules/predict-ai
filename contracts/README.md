# Prediction Market Smart Contracts

Smart contracts for the Predict AI platform. Built with Solidity and Hardhat.

## Quickstart

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
```

## Overview

The primary contract is `PredictionMarket.sol`. It supports ETH and ERC20 payments, time-bounded markets, and on-chain recording of predictions submitted via Chainlink CRE forwarders.

## Security & Access Control

- `PredictionMarket` inherits `ReceiverTemplate`, which includes OpenZeppelin `Ownable`.
- The contract requires a KeystoneForwarder address at construction for CRE reports.
- Owner-only restrictions are used for sensitive operations; if you expect public access for user-facing flows (e.g. `predict`), update access modifiers accordingly.

## Build & Deployment

Set required environment variables (see `.env.example`) then deploy with ignition or your preferred scripts:

```bash
# compile
npx hardhat compile

# example ignition deploy (use network flag)
npx hardhat ignition deploy ignition/modules/PredictionMarket.ts --network <network>
```

## Deployment

Deploy with the KeystoneForwarder address:

```solidity
PredictionMarket market = new PredictionMarket(keystoneForwarderAddress);
```

For Base Sepolia/Mainnet forwarder addresses, see [Chainlink Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory).
**Integration:**

See `/cre/market-payment-received/` for the CRE workflow implementation.

## Usage

### Installation

```shell
npm install
```

### Running Tests

Run all tests:

```shell
npm test
# or
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npm run test:solidity
npm run test:nodejs
# or
npx hardhat test solidity
npx hardhat test nodejs
```

### Compilation

Compile contracts:

```shell
npm run compile
# or
npx hardhat compile
```

Check contract size (must be under 24KB):

```shell
npm run size
```

### Deployment

#### Prerequisites

1. **Get Base Sepolia ETH** (for testnet deployment)
   - Visit: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - You'll need ~0.01 ETH for deployment gas costs

#### Setup Environment

1. Copy `.env.example` to `.env`:

```shell
cp .env.example .env
```

2. Add your private key and RPC URL to `.env`:

```shell
BASE_SEPOLIA_PRIVATE_KEY=your_private_key_here
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

#### Deploy to Base Sepolia (Recommended)

Base Sepolia is the recommended testnet for development with USDC support.

```shell
# Quick deploy with script
npm run deploy:baseSepolia

# Or manually
npm run deploy:baseSepolia
# or
npx hardhat ignition deploy ignition/modules/PredictionMarket.ts --network baseSepolia
```

**Base Sepolia Details:**

- Chain ID: 84532
- RPC URL: https://sepolia.base.org
- USDC Address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Explorer: https://sepolia.basescan.org
- Get testnet ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

#### Deploy to Other Networks

Deploy to local chain:

```shell
npm run deploy:local
# or
npx hardhat ignition deploy ignition/modules/PredictionMarket.ts
```

Deploy to Ethereum Sepolia:

```shell
npm run deploy:sepolia
# or
npx hardhat ignition deploy ignition/modules/PredictionMarket.ts --network sepolia
```

#### Deploy to Base Mainnet (Production)

When ready for production:

```shell
# Update .env with mainnet credentials
BASE_MAINNET_PRIVATE_KEY=your_mainnet_key
BASE_MAINNET_RPC_URL=https://mainnet.base.org

# Deploy to mainnet
npx hardhat ignition deploy ignition/modules/PredictionMarket.ts --network base

# Use mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Integration with X402 Backend

Your X402 backend (`backend/test-x402`) integrates with these contracts:

1. **Create Markets**: Call `createMarket()` with USDC address as payment token
2. **User Payments**: Users pay via X402 paywall (USDC on Base Sepolia)
3. **Place Predictions**: Backend calls `predict()` with user's prediction after X402 payment confirmed
4. **Resolve Markets**: Backend calls `resolveMarket()` when outcome is determined
5. **Auto-Payouts**: Winners automatically receive USDC payouts during resolution

**Example Market Creation:**

```solidity
// Create a USDC market on Base Sepolia
uint256 marketId = predictionMarket.createMarket(
    2,                                           // 2 outcomes (Yes/No)
    block.timestamp + 1 hours,                   // Betting starts in 1 hour
    block.timestamp + 1 days,                    // Betting ends in 1 day
    0x036CbD53842c5426634e7929541eC2318f3dCF7e  // USDC payment token
);
```

## Pre-Mainnet Checklist

Before deploying to Base Mainnet, verify on Base Sepolia:

- ✅ Test market creation with USDC
- ✅ Test placing predictions with USDC (requires approval)
- ✅ Test market resolution and auto-payouts
- ✅ Test preview winnings with `calculatePotentialWinnings()`
- ✅ Verify gas costs for resolution with expected number of predictions
- ✅ Test X402 payment flow integration end-to-end

### Example Usage

#### Create Markets

**ETH Market:**

```solidity
uint256 ethMarketId = predictionMarket.createMarket(
    2, // outcomeCount (e.g., Yes/No)
    block.timestamp + 1 days, // betting starts in 1 day
    block.timestamp + 7 days, // betting ends in 7 days
    address(0) // address(0) = native ETH
);
```

**USDC Market (Base Sepolia):**

```solidity
uint256 usdcMarketId = predictionMarket.createMarket(
    2, // outcomeCount
    block.timestamp + 1 days,
    block.timestamp + 7 days,
    0x036CbD53842c5426634e7929541eC2318f3dCF7e // USDC on Base Sepolia
);
```

#### Place Predictions

**Preview Potential Winnings:**

```solidity
// Preview: "What would I win if I bet 100 USDC on outcome 0?"
uint256 preview = predictionMarket.calculatePotentialWinnings(
    usdcMarketId,
    0, // outcome
    100 * 10**6 // 100 USDC (6 decimals)
);
```

**Bet with ETH:**

```solidity
// Bet 0.1 ETH on outcome 0
predictionMarket.predict{value: 0.1 ether}(
    ethMarketId,
    0, // outcome
    0  // amount (ignored for ETH, uses msg.value)
);
```

**Bet with USDC:**

```solidity
// First, approve USDC
IERC20 usdc = IERC20(0x036CbD53842c5426634e7929541eC2318f3dCF7e);
usdc.approve(address(predictionMarket), 100 * 10**6); // 100 USDC

// Then place bet (no ETH sent)
predictionMarket.predict(
    usdcMarketId,
    0, // outcome
    100 * 10**6 // 100 USDC
);
```

#### Resolve Market

```solidity
// Only creator can resolve, must be after finishesAt
// All winners are automatically paid during this transaction (atomic)
predictionMarket.resolveMarket(marketId, 0); // Outcome 0 wins
```

**Check Winnings:**

```solidity
// Check actual winnings for a prediction
uint256 winnings = predictionMarket.calculateWinnings(predictionId);
```

#### Manual Claim

```solidity
// Users can also manually claim (same payout logic as auto-payout)
predictionMarket.claimWinnings(predictionId);
```

## How Payouts Work

Payouts happen **automatically** when a market is resolved. The payout system is **proportional** to your stake in the winning pool:

```
Your Winnings = (Your Bet / Total Winning Pool) × Total Market Pool
```

**Example:**

- Market has 2 outcomes: Yes/No
- User A bets 2 ETH on Yes
- User B bets 3 ETH on No
- User C bets 1 ETH on Yes
- **Total Pool:** 6 ETH
- **Yes Pool:** 3 ETH (Users A + C)
- **No Pool:** 3 ETH (User B)

If Yes wins:

- User A gets: (2 / 3) × 6 = **4 ETH**
- User C gets: (1 / 3) × 6 = **2 ETH**
- User B gets: **0 ETH**

## Security Considerations

**Re-entrancy Protection:**

- **Checks-Effects-Interactions pattern**: state updated before all external calls
- Predictions marked as `claimed` before transfers
- No separate re-entrancy guard needed - CEI pattern provides sufficient protection
- Uses OpenZeppelin's `Address.sendValue()` for ETH and `SafeERC20.safeTransfer()` for tokens

**Atomic Payouts:**

- **All-or-nothing resolution**: Either all payouts succeed or entire transaction reverts
- No partial payouts - prevents inconsistent state
- Uses `sendValue()` and `safeTransfer()` which revert on failure
- Manual `claimWinnings()` available as alternative claim path

**Access Control:**

- Only market creators can resolve their markets
- Resolution only allowed after betting period ends (finishesAt)
- Betting only allowed during the active window (< finishesAt)

**Gas Considerations:**

- Auto-payout loops through all predictions on the winning outcome
- For markets with many predictions, gas costs could be high during resolution
- Consider limiting market size for production
- Manual `claimWinnings()` available for individual claims if needed

**Data Architecture:**

- Contract stores minimal data: outcome counts, pools, timestamps, payment token
- Questions and outcome descriptions live in off-chain database
- Markets referenced by ID, outcomes by uint8 index (0, 1, 2...)
- This reduces gas costs significantly compared to storing strings on-chain

**Token Support:**

- ETH markets: `paymentToken = address(0)`, uses `msg.value` for bets
- ERC20 markets: requires token approval before betting
- Prevents mixing ETH and ERC20 in same bet (reverts if ETH sent to ERC20 market)
- Uses OpenZeppelin's SafeERC20 for safe token transfers

**Other Notes:**

- Market creators have full control to resolve - consider governance/oracles for trustless resolution
- No fees taken by the contract - all funds go to winners
- Contract size optimized with Solidity optimizer (runs: 200) to stay under 24KB limit

## Development

Built with:

- Solidity ^0.8.20
- Hardhat 3 Beta
- Foundry for Solidity tests
- TypeScript + Node.js test runner

## License

MIT

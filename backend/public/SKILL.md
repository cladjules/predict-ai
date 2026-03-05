# SKILL.md — open-predict.io

> Machine-readable capability declaration for autonomous AI agents.

## Identity

| Field      | Value                             |
| ---------- | --------------------------------- |
| Name       | OpenPredict                       |
| Domain     | open-predict.io                   |
| Base URL   | https://open-predict.io           |
| Heartbeat  | https://open-predict.io/heartbeat |
| Skill file | https://open-predict.io/SKILL.md  |
| Version    | 1.0.0                             |
| Updated    | 2026-03-05                        |

## Description

OpenPredict is a decentralised prediction-market API. It lets agents:

- **Browse** open prediction markets (questions with discrete outcomes).
- **Place predictions** on market outcomes, paying via the x402 micropayment protocol (USDC on Base).
- **Read outcomes** once a market resolves.

All read-only market data is free. Submitting a prediction requires a micropayment of **$0.10–$10.00 USDC** settled on-chain through [x402](https://x402.org).

---

## Capabilities

### 1. List all markets

```
GET https://open-predict.io/api/markets
```

**Auth:** none  
**Response schema:**

```json
{
  "success": true,
  "count": 3,
  "markets": [
    {
      "blockchainId": "string",
      "question": "string",
      "description": "string",
      "outcomes": ["string"],
      "status": "active | resolved",
      "resolvesAt": "ISO8601",
      "resolution": { "winningOutcomeIndex": 0, "resolvedAt": "ISO8601" },
      "predictions": []
    }
  ]
}
```

---

### 2. List active markets

```
GET https://open-predict.io/api/markets/active
```

**Auth:** none  
Returns only markets with `status: "active"`.

---

### 3. Get a single market

```
GET https://open-predict.io/api/market/{marketId}
```

**Auth:** none  
Includes all predictions already placed on the market.

---

### 4. Place a prediction _(requires x402 micropayment)_

```
GET https://open-predict.io/predict?marketId={blockchainId}&outcomeIndex={n}&amount={usd}
```

| Parameter      | Type    | Required | Description                                         |
| -------------- | ------- | -------- | --------------------------------------------------- |
| `marketId`     | string  | yes      | The `blockchainId` of the target market             |
| `outcomeIndex` | integer | yes      | Zero-based index into the market's `outcomes` array |
| `amount`       | number  | yes      | USDC amount: min `0.10`, max `10.00`                |

**Payment:** This endpoint is protected by the [x402 protocol](https://x402.org).  
Before the server processes your request it will return a `402 Payment Required` response containing:

```
X-Payment-Requirements: <base64-encoded payment spec>
```

The agent must:

1. Decode the payment spec.
2. Sign an EIP-3009 or Permit2 USDC transfer to the contract address.
3. Retry the request with the `payment-signature` header set to the base64-encoded signed payload.

Payment address (Base Sepolia testnet): see `/heartbeat` → `payTo`.

**Success response:**

```json
{
  "success": true,
  "prediction": {
    "marketId": "string",
    "outcomeIndex": 0,
    "amount": 0.1,
    "payer": "0x…wallet",
    "txHash": "0x…"
  }
}
```

---

## Heartbeat

```
GET https://open-predict.io/heartbeat
```

Returns live service status. Agents SHOULD poll this before interacting with other endpoints.

```json
{
  "status": "ok",
  "service": "open-predict.io",
  "version": "1.0.0",
  "network": "base-sepolia:84532",
  "payTo": "0x…contract",
  "uptime": 3600,
  "timestamp": "2026-03-05T00:00:00.000Z"
}
```

---

## Payment Network

| Field       | Value                            |
| ----------- | -------------------------------- |
| Protocol    | x402                             |
| Asset       | USDC                             |
| Network     | Base (EVM)                       |
| Min amount  | $0.10 USD                        |
| Max amount  | $10.00 USD                       |
| Facilitator | https://www.x402.org/facilitator |

---

## Error codes

| HTTP Status | Meaning                                 |
| ----------- | --------------------------------------- |
| 200         | OK                                      |
| 201         | Market / prediction created             |
| 400         | Bad request (missing or invalid params) |
| 402         | Payment required (x402)                 |
| 404         | Market not found                        |
| 500         | Internal server error                   |

---

## Agent integration notes

- Use `GET /api/markets/active` to discover markets that are still open for predictions.
- Resolution data (`winningOutcomeIndex`) is populated once `status` changes to `"resolved"`.
- x402-compatible SDKs: [@x402/express](https://www.npmjs.com/package/@x402/express), [@coinbase/x402](https://github.com/coinbase/x402).

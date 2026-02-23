# X402 Crypto Payment Server

Express.js server using [Coinbase X402](https://docs.cdp.coinbase.com/x402) for crypto payments. Accept USDC payments on Base (EVM) networks for API access.

## Features

- 🔒 Protect routes with crypto payment requirements
- 💳 Accept USDC on Base (Ethereum L2)
- 🔐 Cryptographic payment verification
- ⚡ Simple Express middleware integration
- 🌐 Works on testnet (Base Sepolia) and mainnet (Base)
- 💰 **Built-in paywall UI** with wallet connection (MetaMask, Coinbase Wallet, etc.)
- 📊 **Dynamic pricing** - Support for flexible payment amounts ($0.10 - $10.00)
- 🤖 **AI Predictions** - Pay-per-prediction endpoint with validation

## Paywall Integration

This server includes `@x402/paywall` which provides a pre-built UI for:

- 💼 Wallet connection (MetaMask, Coinbase Wallet, Phantom, etc.)
- 💳 Payment flow handling
- ✍️ Transaction signing
- 📊 USDC balance checking
- ⚡ Real-time payment status

When users visit a protected route without payment, they'll see a full payment interface instead of a raw 402 error.

## Prerequisites

- Node.js and npm installed
- A crypto wallet to receive funds (any EVM-compatible wallet)
- For mainnet: [Coinbase Developer Platform](https://cdp.coinbase.com/) account and API keys

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Your receiving wallet address (EVM-compatible)
WALLET_ADDRESS=0xYourWalletAddressHere

# Network: eip155:84532 (Base Sepolia testnet) or eip155:8453 (Base mainnet)
NETWORK=eip155:84532

# Facilitator URL (testnet: https://www.x402.org/facilitator)
FACILITATOR_URL=https://www.x402.org/facilitator

# App name shown in wallet connection UI
APP_NAME=X402 Payment Server

# Server port
PORT=4021
```

### 3. Run the Server

**Development mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm start
```

The server will start at `http://localhost:4021`

## Usage

### Protected Routes

The server includes payment-protected endpoints:

- **GET /weather** - $0.01 USDC - Weather data
- **POST /predict** - $0.10-$10.00 USDC - AI Prediction (dynamic pricing)

### How It Works

1. User visits a protected route (e.g., `/weather`)
2. Server responds with `402 Payment Required` and displays a paywall UI
3. User connects their wallet (MetaMask, Coinbase Wallet, etc.)
4. User approves the USDC payment transaction
5. After payment confirmation, the protected content is displayed

### Testing

#### 1. Try accessing a protected route

Visit `http://localhost:4021/weather` in your browser. You'll see:

- A paywall interface with wallet connection options
- Payment amount and network information
- "Connect Wallet" button to proceed

#### 2. With curl (see raw 402 response)

```bash
curl -i http://localhost:4021/weather
```

You'll get a `402 Payment Required` response with the `PAYMENT-REQUIRED` header containing payment instructions.

#### 3. Complete a test payment

To actually pay and access content, you need:

- A wallet extension (MetaMask, Coinbase Wallet, etc.)
- USDC on Base Sepolia (for testnet)
- Use the Base Sepolia faucet to get test ETH for gas
- Use a USDC faucet or bridge to get test USDC

#### 4. Testing the Prediction Endpoint

Make a POST request to the prediction endpoint:

```bash
curl -X POST http://localhost:4021/predict \
  -H "Content-Type: application/json" \
  -d '{
    "predictionId": "pred_001",
    "answer": "Will it rain tomorrow in San Francisco?",
    "amount": 0.50
  }'
```

Without payment, you'll receive a 402 response with the paywall UI. After connecting your wallet and completing the payment, the prediction will be returned.

- Use a USDC faucet or bridge to get test USDC

## Adding Protected Routes

To protect your own routes, add them to the `paymentMiddleware` configuration in [src/index.ts](src/index.ts):

```typescript
app.use(
  paymentMiddleware(
    {
      "GET /your-route": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01", // USDC amount
            network: "eip155:84532", // Base Sepolia
            payTo: "0xYourAddress",
          },
        ],
        description: "Description of your endpoint",
        mimeType: "application/json",
      },
    },
    server,
    undefined,
    paywall, // The paywall UI is automatically shown on 402 responses
  ),
);

app.get("/your-route", (req, res) => {
  res.json({ data: "Your protected content" });
});
```

## API Endpoints

### Public Routes

- `GET /` - Homepage with instructions
- `GET /health` - Health check

### Protected Routes (require payment)

- `GET /weather` - Weather data ($0.01 USDC)
- `POST /predict` - AI Predictions ($0.10-$10.00 USDC, dynamic pricing)

#### Prediction Endpoint

The `/predict` endpoint accepts POST requests with the following JSON body:

```json
{
  "predictionId": "pred_123",
  "answer": "What will the weather be tomorrow?",
  "amount": 1.5
}
```

**Parameters:**

- `predictionId` (string, required): Unique identifier for the prediction
- `answer` (string, required): The question or prompt for the AI prediction
- `amount` (number, required): Payment amount in USD, must be between 0.10 and 10.00

**Example Request:**

```bash
curl -X POST http://localhost:4021/predict \
  -H "Content-Type: application/json" \
  -d '{
    "predictionId": "pred_123",
    "answer": "What will the weather be tomorrow?",
    "amount": 1.50
  }'
```

**Response (after payment):**

```json
{
  "success": true,
  "prediction": {
    "predictionId": "pred_123",
    "question": "What will the weather be tomorrow?",
    "result": "Based on the question...",
    "confidence": 0.85,
    "amount": "$1.50",
    "timestamp": "2026-02-23T..."
  },
  "message": "Prediction generated successfully"
}
```

## Running on Mainnet

### 1. Set up CDP API Keys

Sign up at [cdp.coinbase.com](https://cdp.coinbase.com/) and create API credentials.

Add to `.env`:

```env
CDP_API_KEY_ID=your-api-key-id
CDP_API_KEY_SECRET=your-api-key-secret
```

### 2. Update Configuration

In [src/index.ts](src/index.ts), update the facilitator client:

```typescript
import { facilitator } from "@coinbase/x402";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
```

### 3. Change Network

Update `.env`:

```env
NETWORK=eip155:8453  # Base mainnet
WALLET_ADDRESS=0xYourMainnetAddress
```

### 4. Test with Real Payments

⚠️ **Warning**: Mainnet involves real money. Test thoroughly on testnet first and start with small amounts.

## Paywall Customization

The paywall UI can be customized via the config:

```typescript
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: "Your App Name",
    appLogo: "https://your-app.com/logo.png", // Optional logo URL
    testnet: true,
  })
  .build();
```

For more options, see the [@x402/paywall documentation](https://www.npmjs.com/package/@x402/paywall).

## Network Identifiers (CAIP-2)

- **Base Mainnet**: `eip155:8453`
- **Base Sepolia**: `eip155:84532` (testnet)

See [Network Support](https://docs.cdp.coinbase.com/x402/network-support) for more networks.

## Production Considerations

For production deployment:

1. ✅ Use a secure wallet for receiving payments
2. ✅ Enable HTTPS for all endpoints
3. ✅ Set up proper monitoring and logging
4. ✅ Configure CDP API credentials for mainnet
5. ✅ Test thoroughly on testnet first
6. ✅ Start with small payment amounts
7. ✅ Implement rate limiting
8. ✅ Add comprehensive error handling

## References

- [X402 Documentation](https://docs.cdp.coinbase.com/x402)
- [X402 Quickstart for Sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [@x402/paywall Package](https://www.npmjs.com/package/@x402/paywall)
- [Example Code Repository](https://github.com/coinbase/x402/tree/main/examples/typescript/servers)

## Support

For questions or support:

- Join the [CDP Discord](https://discord.gg/cdp)
- Check the [X402 Examples](https://github.com/coinbase/x402/tree/main/examples)

## License

MIT

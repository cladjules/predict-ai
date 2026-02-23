import express from "express";
import dotenv from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, HTTPRequestContext } from "@x402/core/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { exact } from "x402/schemes";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4021;

// Prediction amount constraints
const MIN_AMOUNT = 0.1;
const MAX_AMOUNT = 10.0;

const validateAmount = (amount: number): number => {
  return Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, amount));
};

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Your receiving wallet address
const payTo = process.env.WALLET_ADDRESS || "0xYourAddress";

// Create facilitator client (testnet by default)
const facilitatorUrl =
  process.env.FACILITATOR_URL || "https://www.x402.org/facilitator";
const facilitatorClient = new HTTPFacilitatorClient({
  url: facilitatorUrl,
});

// Network: Base Sepolia for testnet, Base mainnet for production
const network = (process.env.NETWORK ||
  "eip155:84532") as `${string}:${string}`; // Base Sepolia

// Create resource server and register EVM scheme
const server = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

// Create paywall with wallet connection UI
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: process.env.APP_NAME || "X402 Payment Server",
    testnet: network === "eip155:84532", // true for Base Sepolia
  })
  .build();

// Apply payment middleware with route configuration
app.use(
  paymentMiddleware(
    {
      "POST /predict": {
        accepts: {
          scheme: "exact",
          payTo,
          price: (context: HTTPRequestContext) => {
            // Access the request body to get the requested amount
            const body = context.adapter.getBody?.() as
              | { amount?: number }
              | undefined;
            const amount = body?.amount || MIN_AMOUNT;

            // Validate amount is in acceptable range
            const validAmount = validateAmount(amount);

            return `$${validAmount.toFixed(2)}`;
          },
          network,
        },
        description:
          "Get AI prediction - pricing based on complexity ($0.10-$10.00)",
        mimeType: "application/json",
      },
    },
    server,
    undefined,
    paywall,
  ),
);

// Public route (no payment required)
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>X402 Payment Server</title></head>
      <body style="font-family: Arial; padding: 20px;">
        <h1>X402 Crypto Payment Server</h1>
        <p>This server uses <a href="https://docs.cdp.coinbase.com/x402">Coinbase X402</a> for crypto payments.</p>
        <hr>
        <h2>Protected Routes:</h2>
        <ul>
          <li><strong>POST /predict</strong> - $0.10-$10.00 USDC - AI Prediction</li>
        </ul>
        <hr>
        <h3>How it works:</h3>
        <ol>
          <li>Visit a protected route in your browser</li>
          <li>You'll see a paywall UI with wallet connection options</li>
          <li>Connect your wallet (MetaMask, Coinbase Wallet, etc.)</li>
          <li>Approve the USDC payment transaction</li>
          <li>After payment, the protected content will be displayed</li>
        </ol>
        <hr>
        <h3>Prediction API:</h3>
        <pre style="background: #f0f0f0; padding: 10px;">
# Make a prediction request
curl -X POST http://localhost:${PORT}/predict \\
  -H "Content-Type: application/json" \\
  -d '{
    "marketId": "pred_123",
    "outcome": "What will the weather be tomorrow?",
    "amount": 1.50
  }'

# Amount must be between $0.10 and $10.00
        </pre>
        <hr>
        <p><strong>Network:</strong> ${network === "eip155:8453" ? "Base Mainnet" : "Base Sepolia (Testnet)"}</p>
        <p><strong>Receiving Address:</strong> ${payTo}</p>
      </body>
    </html>
  `);
});

// Protected route: Prediction endpoint
app.post("/predict", (req, res) => {
  const { marketId, outcome, amount } = req.body;

  // Validate required fields
  if (!marketId || !outcome || amount === undefined) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["marketId", "outcome", "amount"],
    });
  }

  // Validate amount range
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < MIN_AMOUNT || numAmount > MAX_AMOUNT) {
    return res.status(400).json({
      error: "Invalid amount",
      message: `Amount must be between $${MIN_AMOUNT.toFixed(2)} and $${MAX_AMOUNT.toFixed(2)}`,
      received: amount,
    });
  }

  // Extract payer address from x402 payment header
  let payer = "unknown";
  const paymentHeader = req.headers["x-payment"] as string | undefined;
  if (paymentHeader) {
    try {
      const decoded = exact.evm.decodePayment(paymentHeader);
      if ("authorization" in decoded.payload) {
        payer = decoded.payload.authorization.from;
      }
    } catch (e) {
      // Could not extract payer (shouldn't happen if payment was verified)
    }
  }

  // TODO: Do we need to extract Market from DB?

  // Process the prediction (after payment verification by X402 middleware)
  // In production, this would call your AI prediction service
  const prediction = {
    marketId,
    outcome,
    amount,
    payer,
    timestamp: new Date().toISOString(),
  };

  res.json({
    success: true,
    prediction,
    message: "Prediction generated successfully",
  });
});

// Protected route: Premium data
app.get("/data", (req, res) => {
  res.json({
    data: {
      content: "This is premium data that required payment to access.",
      features: ["Real-time updates", "Historical data", "Advanced analytics"],
      timestamp: new Date().toISOString(),
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network,
    payTo,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 X402 Server listening at http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`💳 Payment network: ${network}`);
  console.log(`💰 Receiving address: ${payTo}`);
  console.log(`🔗 Facilitator: ${facilitatorUrl}`);
  console.log(`\n✅ Test the server:`);
  console.log(`   - Public: http://localhost:${PORT}/`);
  console.log(`   - Predictions (POST): http://localhost:${PORT}/predict`);
  console.log(`   - Health: http://localhost:${PORT}/health`);
});

export default app;

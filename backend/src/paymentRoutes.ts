import express, { Request } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient, HTTPRequestContext } from "@x402/core/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";
import { createJWT } from "./utils";
import { Market, Prediction } from "./models";

const router = express.Router();

// Prediction amount constraints
const MIN_AMOUNT = 0.1;
const MAX_AMOUNT = 10.0;

const validateAmount = (amount: number): number => {
  return Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, amount));
};

// Your receiving wallet address
const payTo = process.env.WALLET_RECIPIENT_ADDRESS;

// Create facilitator client (testnet by default)
const facilitatorUrl =
  process.env.FACILITATOR_URL || "https://www.x402.org/facilitator";
const facilitatorClient = new HTTPFacilitatorClient({
  url: facilitatorUrl,
});

const network = process.env.NETWORK as `${string}:${string}`;

if (!payTo || !network) {
  console.error(
    "Error: WALLET_RECIPIENT_ADDRESS or NETWORK is not set in environment variables.",
  );
  process.exit(1);
}

// Create resource server and register EVM scheme
const server = new x402ResourceServer(facilitatorClient).register(
  network,
  new ExactEvmScheme(),
);

// Create paywall with wallet connection UI
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: process.env.APP_NAME,
    testnet: process.env.NETWORK_IS_TESTNET === "true",
  })
  .build();

// Apply payment middleware with route configuration
router.use(
  paymentMiddleware(
    {
      "/predict": {
        accepts: {
          scheme: "exact",
          payTo,
          price: (context: HTTPRequestContext) => {
            // For GET requests, extract amount from URL query string
            // Access the underlying Express request
            const req = (context.adapter as any).req;
            const amount = parseFloat(req?.query?.amount || String(MIN_AMOUNT));
            const validAmount = validateAmount(amount);
            return `$${validAmount.toFixed(2)}`;
          },
          network,
        },
        description:
          "Get AI prediction - pricing based on complexity ($0.10-$10.00)",
        mimeType: "text/html",
      },
    },
    server,
    undefined,
    paywall,
  ),
);

// Helper function to handle prediction logic
async function handlePrediction(
  marketId: string,
  outcomeIndex: string,
  amount: string,
  req: Request,
) {
  const numAmount = validateAmount(parseFloat(amount));

  if (isNaN(numAmount) || numAmount < MIN_AMOUNT || numAmount > MAX_AMOUNT) {
    throw new Error("Invalid amount");
  }

  // Look up the market to get its blockchainId
  const market = await Market.findById(marketId);
  if (!market) {
    throw new Error("Market not found");
  }

  if (!market.blockchainId) {
    throw new Error("Market not yet deployed to blockchain");
  }

  let payer = "unknown";
  let x402TxHash = "";
  let asset = "";

  // Try to extract payer wallet address from X-Payment header
  const xPaymentHeader = req.header("X-Payment");
  if (xPaymentHeader) {
    try {
      // For ExactEvmScheme, payload is either:
      // - ExactEIP3009Payload: { authorization: { from, to, value, ... } }
      // - ExactPermit2Payload: { permit2Authorization: { from, ... } }

      const decoded = JSON.parse(
        Buffer.from(xPaymentHeader, "base64").toString("utf-8"),
      );

      if (decoded.payload) {
        // EIP-3009 (USDC native transfer)
        if (decoded.payload.authorization?.from) {
          payer = decoded.payload.authorization.from;
        }
        // Permit2 flow
        else if (decoded.payload.permit2Authorization?.from) {
          payer = decoded.payload.permit2Authorization.from;
        }

        if (decoded.payload.signature) {
          x402TxHash = decoded.payload.signature;
        }
      }
      if (decoded.accepted) {
        asset = decoded.asset;
      }
    } catch (e) {
      console.error("Failed to decode X-Payment header:", e);
    }
  }

  const prediction = {
    marketId: market.blockchainId, // Use blockchain market ID for CRE workflow
    outcomeIndex: parseInt(String(outcomeIndex)),
    amount: numAmount,
    payer,
    paymentToken: process.env.PAYMENT_TOKEN,
    x402TxHash,
    timestamp: new Date().toISOString(),
  };

  console.log("Will process prediction:", prediction);

  // CRE HTTP Trigger JWT Auth
  const creUrl = process.env.CRE_TRIGGER_URL;
  const creParams = {
    id: `pred_${market._id}_${payer}_${Date.now()}`,
    jsonrpc: "2.0",
    method: "workflows.execute",
    params: {
      input: prediction,
      workflow: { workflowID: process.env.CRE_WORKFLOW_ID },
    },
  };

  const jwt = await createJWT(
    creParams,
    process.env.WALLET_PRIVATE_KEY as `0x${string}`,
  );
  if (process.env.SIMULATE === "true") {
    console.log("Simulating CRE workflow execution...");
    console.log("Workflow input:", creParams.params.input);
    console.log("Workflow ID:", creParams.params.workflow.workflowID);
    return prediction;
  }

  const response = await (
    await fetch(creUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(creParams),
    })
  ).json();

  if (response.error) {
    console.error("Error triggering CRE workflow:", response.error);
    throw new Error("Workflow failed");
  }

  console.log("CRE workflow triggered successfully:", response);

  // Save prediction to database
  const MONGODB_URI = process.env.MONGODB_URI;
  if (MONGODB_URI) {
    try {
      const dbPrediction = new Prediction({
        market: marketId, // MongoDB ObjectId
        payer: prediction.payer,
        outcomeIndex: prediction.outcomeIndex,
        amount: prediction.amount,
        paymentToken: prediction.paymentToken,
        x402TxHash: prediction.x402TxHash,
        timestamp: new Date(prediction.timestamp),
      });
      await dbPrediction.save();
      console.log("Prediction saved to database");
    } catch (dbError) {
      console.error("Failed to save prediction to database:", dbError);
      // Don't fail the request if DB save fails
    }
  }

  return prediction;
}

// Public route: Homepage with prediction form
router.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>X402 Prediction Market</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
          }
          h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            color: #333;
            font-weight: 600;
            margin-bottom: 8px;
            font-size: 14px;
          }
          input, select {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
          }
          input:focus, select:focus {
            outline: none;
            border-color: #667eea;
          }
          .input-hint {
            font-size: 12px;
            color: #999;
            margin-top: 5px;
          }
          button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
          }
          button:active {
            transform: translateY(0);
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 25px;
            border-radius: 4px;
          }
          .info-box p {
            font-size: 13px;
            color: #555;
            line-height: 1.6;
          }
          .network-info {
            text-align: center;
            margin-top: 25px;
            padding-top: 25px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔮 AI Prediction Market</h1>
          <p class="subtitle">Pay with crypto to submit your prediction</p>
          
          <div class="info-box">
            <p><strong>💳 How it works:</strong><br>
            Fill out the form and submit. You'll see a paywall to connect your wallet and pay with USDC. After payment, your prediction will be processed.</p>
          </div>

          <form method="GET" action="/x402/predict">
            <div class="form-group">
              <label for="marketId">Market ID</label>
              <input 
                type="text" 
                id="marketId" 
                name="marketId" 
                placeholder="e.g., market_123"
                required
              />
              <div class="input-hint">The unique identifier for the prediction market</div>
            </div>

            <div class="form-group">
              <label for="outcomeIndex">Outcome Index</label>
              <input 
                type="number" 
                id="outcomeIndex" 
                name="outcomeIndex" 
                placeholder="e.g., 0 or 1"
                min="0"
                required
              />
              <div class="input-hint">The index of the outcome you're predicting (usually 0 or 1)</div>
            </div>

            <div class="form-group">
              <label for="amount">Amount (USD)</label>
              <input 
                type="number" 
                id="amount" 
                name="amount" 
                placeholder="Enter amount"
                min="${MIN_AMOUNT}"
                max="${MAX_AMOUNT}"
                step="0.01"
                value="1.00"
                required
              />
              <div class="input-hint">Amount to pay: $${MIN_AMOUNT.toFixed(2)} - $${MAX_AMOUNT.toFixed(2)} USDC</div>
            </div>

            <button type="submit">Submit Prediction 💰</button>
          </form>

          <div class="network-info">
            <strong>Network:</strong> ${network === "eip155:8453" ? "Base Mainnet" : "Base Sepolia (Testnet)"}<br>
            <strong>Receiver:</strong> ${payTo?.substring(0, 6)}...${payTo?.substring(38)}
          </div>
        </div>
      </body>
    </html>
  `);
});

// Protected route: Prediction endpoint (GET - with paywall for browser form)
router.get("/predict", async (req, res) => {
  const { marketId, outcomeIndex, amount } = req.query;

  if (!marketId || outcomeIndex === undefined || amount === undefined) {
    return res.sendStatus(400);
  }

  try {
    const prediction = await handlePrediction(
      marketId as string,
      outcomeIndex as string,
      amount as string,
      req,
    );

    // Return HTML success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Prediction Success</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
              background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 600px;
              width: 100%;
              padding: 40px;
              text-align: center;
            }
            h1 { color: #11998e; margin-bottom: 20px; font-size: 32px; }
            .success-icon { font-size: 80px; margin-bottom: 20px; }
            .details {
              background: #f8f9fa;
              border-radius: 10px;
              padding: 20px;
              margin: 25px 0;
              text-align: left;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #e0e0e0;
            }
            .detail-row:last-child { border-bottom: none; }
            .label { font-weight: 600; color: #555; }
            .value { color: #333; word-break: break-all; }
            a {
              display: inline-block;
              margin-top: 20px;
              padding: 12px 30px;
              background: #11998e;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              transition: background 0.3s;
            }
            a:hover { background: #0d7a6f; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">🎉</div>
            <h1>Payment Successful!</h1>
            <p>Your prediction has been submitted and processed.</p>
            
            <div class="details">
              <div class="detail-row">
                <span class="label">Market ID:</span>
                <span class="value">${prediction.marketId}</span>
              </div>
              <div class="detail-row">
                <span class="label">Outcome Index:</span>
                <span class="value">${prediction.outcomeIndex}</span>
              </div>
              <div class="detail-row">
                <span class="label">Amount Paid:</span>
                <span class="value">$${prediction.amount.toFixed(2)} USDC</span>
              </div>
              <div class="detail-row">
                <span class="label">Payer Address:</span>
                <span class="value">${prediction.payer.substring(0, 6)}...${prediction.payer.substring(38)}</span>
              </div>
              <div class="detail-row">
                <span class="label">Timestamp:</span>
                <span class="value">${new Date(prediction.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <a href="/x402">← Submit Another Prediction</a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error handling prediction:", error);
    const status = (error as Error).message === "Invalid amount" ? 400 : 500;
    return res.sendStatus(status);
  }
});

// API route: Prediction endpoint (POST - without paywall for direct API calls)
router.post("/predict", async (req, res) => {
  const { marketId, outcomeIndex, amount } = req.body;

  if (!marketId || outcomeIndex === undefined || amount === undefined) {
    return res.sendStatus(400);
  }

  try {
    const prediction = await handlePrediction(
      marketId,
      outcomeIndex,
      amount,
      req,
    );

    res.json({
      success: true,
      prediction,
      message: "Prediction generated successfully",
    });
  } catch (error) {
    console.error("Error handling prediction:", error);
    const status = (error as Error).message === "Invalid amount" ? 400 : 500;
    return res.sendStatus(status);
  }
});

export default router;

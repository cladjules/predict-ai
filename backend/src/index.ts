import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import dbRoutes from "./dbRoutes";
import paymentRoutes from "./paymentRoutes";

const app = express();
const PORT = process.env.PORT || 4021;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err: Error) => console.error("❌ MongoDB connection error:", err));
} else {
  console.warn("⚠️  MONGODB_URI not set - database routes will not work");
}

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database routes (no payment required)
app.use("/api", dbRoutes);

// Payment routes (X402 protected)
app.use("/x402", paymentRoutes);

// Health check
app.get("/health", (req, res) => {
  const network = process.env.NETWORK;
  const payTo = process.env.WALLET_RECIPIENT_ADDRESS;
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
  console.log(`💳 Payment network: ${process.env.NETWORK}`);
  console.log(`💰 Receiving address: ${process.env.WALLET_RECIPIENT_ADDRESS}`);
  console.log(
    `🔗 Facilitator: ${process.env.FACILITATOR_URL || "https://www.x402.org/facilitator"}`,
  );
  console.log(`\n✅ Test the server:`);
  console.log(`   - Public: http://localhost:${PORT}/x402`);
  console.log(
    `   - Predictions (GET with paywall): http://localhost:${PORT}/x402/predict`,
  );
  console.log(
    `   - Predictions (POST API - no paywall): http://localhost:${PORT}/x402/predict`,
  );
  console.log(`   - Health: http://localhost:${PORT}/health`);
  console.log(`\n📊 Database API (no payment required):`);
  console.log(`   - POST /api/markets - Create a market`);
  console.log(`   - GET /api/markets - Fetch all markets`);
  console.log(`   - GET /api/markets/:marketId - Fetch specific market`);
  console.log(`   - POST /api/markets/:marketId/predictions - Add prediction`);
  console.log(`   - POST /api/markets/:marketId/resolve - Resolve market`);
});

export default app;

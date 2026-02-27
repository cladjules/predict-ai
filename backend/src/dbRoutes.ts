import express, { Router } from "express";
import { Market, Prediction, IMarket, IPrediction } from "./models";
import { apiKeyMiddleware } from "./middleware";

const router: Router = express.Router();

// POST /api/markets - Create one or more markets
router.post("/markets", apiKeyMiddleware, async (req, res) => {
  try {
    // Accept either a single market or an array of markets
    const marketsData = Array.isArray(req.body) ? req.body : [req.body];

    const marketsToInsert = [];

    // Validate all markets
    for (const marketData of marketsData) {
      const { question, outcomes } = marketData;

      // Discard if market if same hash exists already (prevents duplicates from multiple CRE instances)
      if (marketData.contentHash) {
        const existingMarket = await Market.findOne({
          contentHash: marketData.contentHash,
        });
        if (existingMarket) {
          continue; // Skip creating this market since it already exists
        }
      }

      if (!question || !outcomes || !Array.isArray(outcomes)) {
        return res
          .status(400)
          .json({ error: "Missing required fields (question, outcomes)" });
      }

      if (outcomes.length < 2) {
        return res
          .status(400)
          .json({ error: "Market must have at least 2 outcomes" });
      }

      console.log("Validated market data:", marketData.question);
      marketsToInsert.push(marketData);
    }

    // Create all markets
    const markets = await Market.insertMany(
      marketsToInsert.map((marketData) => ({
        resolvesAt: marketData.resolvesAt,
        question: marketData.question,
        description: marketData.description,
        outcomes: marketData.outcomes,
        contentHash: marketData.contentHash,
        status: "active",
      })),
    );

    res.status(201).json({
      success: true,
      count: markets.length,
      markets,
    });
  } catch (error) {
    console.error("Error creating market(s):", error);
    res.status(500).json({ error: "Failed to create market(s)" });
  }
});

// GET /api/markets - Fetch all markets with their predictions
router.get("/markets", async (req, res) => {
  try {
    const markets = await Market.find().sort({ createdAt: -1 });

    // Fetch predictions for all markets
    const marketIds = markets.map((m: IMarket) => m._id);
    const predictions = await Prediction.find({
      market: { $in: marketIds },
    }).sort({ timestamp: -1 });

    // Group predictions by market _id
    const predictionsByMarket = predictions.reduce(
      (acc: Record<string, IPrediction[]>, pred: IPrediction) => {
        const marketId = pred.market.toString();
        if (!acc[marketId]) {
          acc[marketId] = [];
        }
        acc[marketId].push(pred);
        return acc;
      },
      {} as Record<string, typeof predictions>,
    );

    // Combine markets with their predictions
    const marketsWithPredictions = markets.map((market: IMarket) => ({
      ...market.toObject(),
      predictions: predictionsByMarket[market._id.toString()] || [],
    }));

    res.json({
      success: true,
      count: markets.length,
      markets: marketsWithPredictions,
    });
  } catch (error) {
    console.error("Error fetching markets:", error);
    res.status(500).json({ error: "Failed to fetch markets" });
  }
});

// GET /api/markets/:id - Fetch a specific market with predictions
router.get("/markets/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const market = await Market.findById(id);
    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }

    const predictions = await Prediction.find({ market: id }).sort({
      timestamp: -1,
    });

    res.json({
      success: true,
      market: {
        ...market.toObject(),
        predictions,
      },
    });
  } catch (error) {
    console.error("Error fetching market:", error);
    res.status(500).json({ error: "Failed to fetch market" });
  }
});

// GET /api/markets/active - Fetch markets eligible for resolution
router.get("/markets/active", async (req, res) => {
  try {
    // Find all active markets (status = 'active') and resolvesAt is in the past
    const activeMarkets = await Market.find({
      status: "active",
      resolvesAt: { $lte: new Date() },
    }).sort({
      resolvesAt: -1,
    });

    res.json({
      success: true,
      count: activeMarkets.length,
      markets: activeMarkets,
    });
  } catch (error) {
    console.error("Error fetching eligible markets:", error);
    res.status(500).json({ error: "Failed to fetch eligible markets" });
  }
});

// POST /api/markets/:blockchainId/predictions - Add a prediction to a market
router.post(
  "/markets/:blockchainId/predictions",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const { blockchainId } = req.params;
      const { payer, outcomeIndex, amount, paymentToken, x402TxHash } =
        req.body;

      if (
        !payer ||
        outcomeIndex === undefined ||
        !amount ||
        !paymentToken ||
        !x402TxHash
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const market = await Market.findOne({ blockchainId });
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      if (market.status !== "active") {
        return res
          .status(400)
          .json({ error: "Cannot add predictions to inactive market" });
      }

      if (outcomeIndex < 0 || outcomeIndex >= market.outcomes.length) {
        return res.status(400).json({ error: "Invalid outcome index" });
      }

      const prediction = new Prediction({
        market: market._id,
        payer,
        outcomeIndex,
        amount,
        paymentToken,
        x402TxHash,
        timestamp: new Date(),
      });

      await prediction.save();

      res.status(201).json({
        success: true,
        prediction,
      });
    } catch (error) {
      console.error("Error creating prediction:", error);
      res.status(500).json({ error: "Failed to create prediction" });
    }
  },
);

// PATCH /api/markets/:id - Update market with blockchain ID
router.patch("/markets/:id", apiKeyMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { blockchainId } = req.body;

    if (!blockchainId) {
      return res.status(400).json({ error: "blockchainId is required" });
    }

    const market = await Market.findById(id);
    if (!market) {
      return res.status(404).json({ error: "Market not found" });
    }

    market.blockchainId = blockchainId;
    await market.save();

    res.json({
      success: true,
      market,
    });
  } catch (error) {
    console.error("Error updating market:", error);
    res.status(500).json({ error: "Failed to update market" });
  }
});

// POST /api/markets/:blockchainId/resolve - Resolve a market
router.post(
  "/markets/:blockchainId/resolve",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const { blockchainId } = req.params;
      const { resolvedOutcome } = req.body;

      if (resolvedOutcome === undefined || resolvedOutcome === null) {
        return res.status(400).json({ error: "resolvedOutcome is required" });
      }

      const market = await Market.findOne({ blockchainId });
      if (!market) {
        return res.status(404).json({ error: "Market not found" });
      }

      if (market.status === "resolved") {
        return res.status(400).json({ error: "Market already resolved" });
      }

      if (resolvedOutcome < 0 || resolvedOutcome >= market.outcomes.length) {
        return res
          .status(400)
          .json({ error: "Invalid resolved outcome index" });
      }

      market.resolvedOutcome = resolvedOutcome;
      market.status = "resolved";
      await market.save();

      res.json({
        success: true,
        market,
      });
    } catch (error) {
      console.error("Error resolving market:", error);
      res.status(500).json({ error: "Failed to resolve market" });
    }
  },
);

export default router;

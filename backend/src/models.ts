import mongoose, { Schema, Document } from "mongoose";

export interface IMarket extends Document {
  blockchainId?: string;
  question: string;
  description?: string;
  outcomes: string[];
  resolvedOutcome?: number;
  resolvesAt: Date;
  status: "active" | "resolved" | "cancelled";
  // Content hash for matching with blockchain MarketCreated events
  // Includes question, description, and blockchain params
  contentHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPrediction extends Document {
  market: mongoose.Types.ObjectId;
  payer: string;
  outcomeIndex: number;
  amount: number;
  paymentToken: string;
  x402TxHash: string;
  timestamp: Date;
}

const MarketSchema = new Schema<IMarket>(
  {
    blockchainId: { type: String, index: true },
    question: { type: String, required: true },
    description: { type: String },
    outcomes: [{ type: String, required: true }],
    resolvedOutcome: { type: Number },
    resolvesAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "resolved", "cancelled"],
      default: "active",
    },
    contentHash: { type: String, index: true },
  },
  { timestamps: true },
);

const PredictionSchema = new Schema<IPrediction>(
  {
    market: {
      type: Schema.Types.ObjectId,
      ref: "Market",
      required: true,
      index: true,
    },
    payer: { type: String, required: true },
    outcomeIndex: { type: Number, required: true },
    amount: { type: Number, required: true },
    paymentToken: { type: String, required: true },
    x402TxHash: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const Market = mongoose.model<IMarket>("Market", MarketSchema);
export const Prediction = mongoose.model<IPrediction>(
  "Prediction",
  PredictionSchema,
);

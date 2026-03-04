export interface PredictionMarket {
  _id?: string;
  blockchainId?: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomeIndex?: number;
  verificationUrl: string;
  status: string;
  contentHash: string;
  resolvesAt: string;
}

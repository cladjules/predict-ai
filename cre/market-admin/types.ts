export interface PredictionMarket {
  id?: number;
  title: string;
  description: string;
  options: string[];
  resolvedOption?: string;
  verificationUrl: string;
  resolvesAt: string;
}

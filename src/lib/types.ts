export type CommoditySlug = "copper_lme" | "nickel_lme" | "aluminium_lme";

export type Commodity = {
  slug: CommoditySlug;
  name: string;
  symbol: string;
  colorHex: string;
  description: string;
};

export type PricePoint = {
  date: string;
  commodity: CommoditySlug;
  price: number;
};

export type SentimentPoint = PricePoint & {
  newsIds: string[];
  newsCount: number;
  newsItems: NewsEvent[];
  newsSummary: string;
  negative: number;
  neutral: number;
  positive: number;
  sentimentScore: number;
  finbertNegative: number;
  finbertNeutral: number;
  finbertPositive: number;
  finbertSentimentScore: number;
  finbertLabel: string;
};

export type NewsEvent = {
  id: string;
  date: string;
  eventDay: string;
  title: string;
  url: string;
  impactedCommodities: CommoditySlug[];
  summary: string;
};

export type CommoditySignal = {
  open: number;
  latest: number;
  high: number;
  low: number;
  average: number;
  change: number;
  changePct: number;
  trend14d: number;
  volatility30d: number;
  averageSentiment: number;
  latestSummary: string;
};

export type DashboardData = {
  commodities: Commodity[];
  pricesByCommodity: Record<CommoditySlug, SentimentPoint[]>;
  news: NewsEvent[];
  agentGym: AgentGymData;
  predictionChart: PredictionChartData;
};

export type AgentModelKind = "single_asset_ppo" | "multiple_asset_ppo";
export type AgentDatasetKind = "test" | "full";
export type AgentActionName = "hold" | "buy" | "sell";

export type AgentDecisionPoint = {
  model: AgentModelKind;
  dataset: AgentDatasetKind;
  split: number;
  datasetIndex: number;
  phase: "train" | "test";
  date: string;
  commodity: CommoditySlug;
  price: number;
  action: 0 | 1 | 2;
  actionName: AgentActionName;
  greedyAction: 0 | 1 | 2;
  greedyActionName: AgentActionName;
  probHold: number;
  probBuy: number;
  probSell: number;
  entropy: number;
  normalizedEntropy: number;
  confidence: number;
  netWorth: number;
  reward: number;
  position: number | null;
};

export type AgentGymData = {
  points: AgentDecisionPoint[];
  sources: Array<{
    model: AgentModelKind;
    dataset: AgentDatasetKind;
    split: number;
    commodity?: CommoditySlug;
    path: string;
  }>;
};

export type PredictionModelKind =
  | "ar1_baseline"
  | "gaussian_process_price_only"
  | "gaussian_process_sentiment"
  | "lstm_price_only"
  | "lstm_sentiment"
  | "ridge_arx_price_only"
  | "ridge_arx_sentiment"
  | "lightgbm_direct_price_only"
  | "lightgbm_direct_sentiment"
  | "lightgbm_price_only"
  | "lightgbm_sentiment";
export type PredictionEvaluationMode = "direct_multi_horizon" | "observed_history" | "recursive_path";

export type PredictionPoint = {
  model: PredictionModelKind;
  evaluationMode: PredictionEvaluationMode;
  split: number;
  datasetIndex: number;
  date: string;
  commodity: CommoditySlug;
  predictedPrice: number | null;
  error: number | null;
  absoluteError: number | null;
  alpha: number;
  beta: number;
};

export type PredictionSource = {
  model: PredictionModelKind;
  evaluationMode: PredictionEvaluationMode;
  split: number;
  commodity?: CommoditySlug;
  path: string;
  directionAccuracy: number | null;
  directionCorrectCount: number;
  directionEvaluatedCount: number;
};

export type PredictionChartData = {
  points: PredictionPoint[];
  sources: PredictionSource[];
};

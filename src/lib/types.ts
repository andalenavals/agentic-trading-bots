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

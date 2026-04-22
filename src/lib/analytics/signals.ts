import type { CommoditySignal, SentimentPoint } from "@/lib/types";

export function computeSignals(points: SentimentPoint[]): CommoditySignal {
  if (points.length < 2) {
    return {
      open: 0,
      latest: 0,
      high: 0,
      low: 0,
      average: 0,
      change: 0,
      changePct: 0,
      trend14d: 0,
      volatility30d: 0,
      averageSentiment: 0,
      latestSummary: "",
    };
  }

  const prices = points.map((point) => point.price);
  const open = prices[0];
  const latest = prices[prices.length - 1];
  const change = latest - open;
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const last14 = points.slice(-14);
  const last30 = points.slice(-30);
  const mean30 = last30.reduce((sum, point) => sum + point.price, 0) / last30.length;
  const variance30 = last30.reduce((sum, point) => sum + (point.price - mean30) ** 2, 0) / last30.length;

  return {
    open,
    latest,
    high: Math.max(...prices),
    low: Math.min(...prices),
    average,
    change,
    changePct: open ? (change / open) * 100 : 0,
    trend14d:
      last14.length > 1
        ? ((last14[last14.length - 1].price - last14[0].price) / last14[0].price) * 100
        : 0,
    volatility30d: mean30 ? (Math.sqrt(variance30) / mean30) * 100 : 0,
    averageSentiment:
      last30.reduce((sum, point) => sum + point.sentimentScore, 0) / Math.max(last30.length, 1),
    latestSummary: points[points.length - 1].newsSummary,
  };
}

export function signalLabel(signal: CommoditySignal): { label: string; tone: "positive" | "negative" | "neutral" } {
  if (signal.trend14d > 3 && signal.averageSentiment > 0.1) return { label: "Constructive", tone: "positive" };
  if (signal.trend14d < -3 || signal.averageSentiment < -0.1) return { label: "Pressure", tone: "negative" };
  return { label: "Watch", tone: "neutral" };
}


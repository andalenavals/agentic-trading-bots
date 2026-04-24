import { cache } from "react";
import { readFile } from "node:fs/promises";
import { COMMODITIES, normalizeCommodity } from "@/lib/analytics/commodities";
import { loadAgentGymData } from "@/lib/data/agent-loaders";
import { loadPredictionChartData } from "@/lib/data/prediction-loaders";
import { parseCsv, toNumber } from "@/lib/data/csv";
import { dataPath } from "@/lib/data/paths";
import type { CommoditySlug, DashboardData, NewsEvent, SentimentPoint } from "@/lib/types";

async function readDataFile(relativePath: string) {
  return readFile(dataPath(relativePath), "utf8");
}

export const loadDashboardData = cache(async (): Promise<DashboardData> => {
  const [sentimentCsv, newsCsv, agentGym, predictionChart] = await Promise.all([
    readDataFile("processed/prices_with_sentiment.csv"),
    readDataFile("processed/news_events.csv"),
    loadAgentGymData(),
    loadPredictionChartData(),
  ]);

  const pricesByCommodity: Record<CommoditySlug, SentimentPoint[]> = {
    copper_lme: [],
    nickel_lme: [],
    aluminium_lme: [],
  };

  for (const row of parseCsv(sentimentCsv)) {
    const commodity = normalizeCommodity(row.commodity);
    if (!commodity) continue;

    pricesByCommodity[commodity].push({
      date: row.date,
      commodity,
      price: toNumber(row.price),
      newsIds: row.news_ids ? row.news_ids.split(";").filter(Boolean) : [],
      newsCount: toNumber(row.news_count),
      newsItems: parseNewsItems(row.news_items),
      newsSummary: row.news_summary,
      negative: toNumber(row.negative),
      neutral: toNumber(row.neutral),
      positive: toNumber(row.positive),
      sentimentScore: toNumber(row.sentiment_score),
      finbertNegative: toNumber(row.finbert_negative),
      finbertNeutral: toNumber(row.finbert_neutral),
      finbertPositive: toNumber(row.finbert_positive),
      finbertSentimentScore: toNumber(row.finbert_sentiment_score),
      finbertLabel: row.finbert_label ?? "",
    });
  }

  for (const points of Object.values(pricesByCommodity)) {
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  const news: NewsEvent[] = parseCsv(newsCsv)
    .map((row) => {
      const impactedCommodities = row.impacted_commodities
        .split(";")
        .map(normalizeCommodity)
        .filter((commodity): commodity is CommoditySlug => commodity !== null);

      return {
        id: row.event_id,
        date: row.date,
        eventDay: row.event_day || row.date.slice(0, 10),
        title: row.title,
        url: row.url,
        impactedCommodities,
        summary: row.summary,
      };
    })
    .filter((event) => event.impactedCommodities.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    commodities: COMMODITIES,
    pricesByCommodity,
    news,
    agentGym,
    predictionChart,
  };
});

function parseNewsItems(value: string): NewsEvent[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Array<Record<string, string>>;
    return parsed.flatMap((item) => {
      const impactedCommodities = (item.impacted_commodities ?? "")
        .split(";")
        .map(normalizeCommodity)
        .filter((commodity): commodity is CommoditySlug => commodity !== null);

      if (!item.event_id || impactedCommodities.length === 0) return [];

      return [{
        id: item.event_id,
        date: item.date ?? "",
        eventDay: item.event_day || (item.date ?? "").slice(0, 10),
        title: item.title ?? "",
        url: item.url ?? "",
        impactedCommodities,
        summary: item.summary ?? "",
      }];
    });
  } catch {
    return [];
  }
}

import { cache } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMMODITIES, normalizeCommodity } from "@/lib/analytics/commodities";
import { loadAgentGymData } from "@/lib/data/agent-loaders";
import { parseCsv, toNumber } from "@/lib/data/csv";
import type { CommoditySlug, DashboardData, NewsEvent, SentimentPoint } from "@/lib/types";

const DATA_ROOT = path.join(process.cwd(), "data");

async function readDataFile(relativePath: string) {
  return readFile(path.join(DATA_ROOT, relativePath), "utf8");
}

export const loadDashboardData = cache(async (): Promise<DashboardData> => {
  const [sentimentCsv, newsCsv, agentGym] = await Promise.all([
    readDataFile("processed/prices_with_sentiment.csv"),
    readDataFile("processed/news_events.csv"),
    loadAgentGymData(),
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
      newsSummary: row.news_summary,
      negative: toNumber(row.negative),
      neutral: toNumber(row.neutral),
      positive: toNumber(row.positive),
      sentimentScore: toNumber(row.sentiment_score),
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
  };
});

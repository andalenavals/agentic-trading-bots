import type { CommoditySlug, NewsEvent, SentimentPoint } from "@/lib/types";

export function newsForMarketPoint(news: NewsEvent[], commodity: CommoditySlug, point: SentimentPoint) {
  if (point.newsIds.length > 0) {
    const selectedIds = new Set(point.newsIds);
    return news
      .filter((event) => selectedIds.has(event.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const eventDay = point.date.slice(0, 10);
  return news
    .filter((event) => event.eventDay === eventDay && event.impactedCommodities.includes(commodity))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sourceName(url: string) {
  const host = safeHost(url);
  if (!host) return "News";
  if (host.includes("metal")) return "Metal.com";
  if (host.includes("reuters")) return "Reuters";
  if (host.includes("nasdaq")) return "Nasdaq";
  if (host.includes("afr")) return "AFR";
  if (host.includes("rnz")) return "RNZ";
  return host.replace(/^www\./, "").split(".")[0] || "News";
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

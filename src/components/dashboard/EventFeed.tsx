"use client";

import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import { sourceName } from "@/lib/analytics/news";
import type { Commodity, CommoditySlug, NewsEvent } from "@/lib/types";

type Props = {
  commodities: Commodity[];
  news: NewsEvent[];
  filter: CommoditySlug | "all";
  onFilterChange: (slug: CommoditySlug | "all") => void;
};

export function EventFeed({ commodities, news, filter, onFilterChange }: Props) {
  return (
    <aside className="panel">
      <div className="panel-head">
        <div>
          <h2 style={{ fontSize: 17 }}>Market events</h2>
          <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>Recent news linked to materials</p>
        </div>
        <select
          aria-label="Filter events by commodity"
          onChange={(event) => onFilterChange(event.target.value as CommoditySlug | "all")}
          style={{ background: "#202536", border: "1px solid #2c3243", borderRadius: 7, color: "#f4f6fb", padding: "8px 10px" }}
          value={filter}
        >
          <option value="all">All</option>
          {commodities.map((commodity) => (
            <option key={commodity.slug} value={commodity.slug}>
              {commodity.name}
            </option>
          ))}
        </select>
      </div>
      <div className="events">
        {news.map((event) => (
          <article className="event" key={event.id}>
            <div className="tag-row">
              <span className="source">{sourceName(event.url)}</span>
              <span className="faint" style={{ fontSize: 11 }}>
                {new Date(event.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
              </span>
              {event.impactedCommodities.map((slug) => {
                const commodity = COMMODITY_LOOKUP[slug];
                return (
                  <span
                    className="chip"
                    key={slug}
                    style={{ backgroundColor: `${commodity.colorHex}22`, color: commodity.colorHex, height: 24, width: 24, fontSize: 10 }}
                  >
                    {commodity.symbol}
                  </span>
                );
              })}
            </div>
            <a href={event.url} rel="noreferrer" target="_blank">
              {event.title}
            </a>
            <p>{event.summary}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}


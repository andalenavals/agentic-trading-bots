"use client";

import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import { sourceName } from "@/lib/analytics/news";
import type { Commodity, SentimentPoint } from "@/lib/types";

type Props = {
  commodity: Commodity;
  embedded?: boolean;
  selectedPoint: SentimentPoint | null;
};

export function EventFeed({ commodity, embedded = false, selectedPoint }: Props) {
  const news = selectedPoint?.newsItems ?? [];

  return (
    <aside className={`${embedded ? "market-news-section " : "panel "}event-feed`}>
      <div className="events">
        {!selectedPoint ? (
          <div className="empty-state">
            <h3>No point selected</h3>
            <p>News appears here only after clicking a date in the price chart.</p>
          </div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <h3>No linked news</h3>
            <p>The selected date has no raw news rows tagged for {commodity.name}.</p>
          </div>
        ) : (
          news.map((event) => (
            <article className="event" key={event.id}>
              <div className="tag-row">
                <span className="source">{sourceName(event.url)}</span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {new Date(event.date).toLocaleString("en-GB", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", year: "2-digit" })}
                </span>
                {event.impactedCommodities.map((slug) => {
                  const impacted = COMMODITY_LOOKUP[slug];
                  return (
                    <span
                      className="chip"
                      key={slug}
                      style={{ backgroundColor: `${impacted.colorHex}22`, color: impacted.colorHex, height: 24, width: 24, fontSize: 10 }}
                      title={impacted.name}
                    >
                      {impacted.symbol}
                    </span>
                  );
                })}
              </div>
              <a href={event.url} rel="noreferrer" target="_blank">
                {event.title}
              </a>
              <p>{event.summary}</p>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

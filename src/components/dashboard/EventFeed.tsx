"use client";

import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import { sourceName } from "@/lib/analytics/news";
import type { Commodity, NewsEvent, SentimentPoint } from "@/lib/types";

type Props = {
  commodity: Commodity;
  news: NewsEvent[];
  selectedPoint: SentimentPoint | null;
};

export function EventFeed({ commodity, news, selectedPoint }: Props) {
  return (
    <aside className="panel news-context-panel">
      <div className="panel-head">
        <div>
          <h2 style={{ fontSize: 17 }}>Clicked-date news</h2>
          <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
            {selectedPoint
              ? `${commodity.name} context for ${new Date(selectedPoint.date).toLocaleDateString()}`
              : "Select a point in the price chart"}
          </p>
        </div>
        <span className="source">{news.length} items</span>
      </div>

      {!selectedPoint ? (
        <div className="empty-state news-empty">
          <h3>No date selected</h3>
          <p>Click directly on the price time series to show every news item for that commodity and day.</p>
        </div>
      ) : news.length === 0 ? (
        <div className="empty-state news-empty">
          <h3>No linked news</h3>
          <p>No curated news item is linked to {commodity.name} on this date.</p>
        </div>
      ) : (
        <div className="events">
          {news.map((event) => (
            <article className="event" key={event.id}>
              <div className="tag-row">
                <span className="source">{sourceName(event.url)}</span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {new Date(event.date).toLocaleString("en-GB", {
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
                {event.impactedCommodities.map((slug) => {
                  const impacted = COMMODITY_LOOKUP[slug];
                  return (
                    <span
                      className="chip"
                      key={slug}
                      style={{ backgroundColor: `${impacted.colorHex}22`, color: impacted.colorHex, fontSize: 10, height: 24, width: 24 }}
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
          ))}
        </div>
      )}
    </aside>
  );
}

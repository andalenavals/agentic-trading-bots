"use client";

import { computeSignals, signalLabel } from "@/lib/analytics/signals";
import type { Commodity, CommoditySlug, SentimentPoint } from "@/lib/types";

type Props = {
  commodities: Commodity[];
  pricesByCommodity: Record<CommoditySlug, SentimentPoint[]>;
  activeCommodity: CommoditySlug;
  onSelect: (slug: CommoditySlug) => void;
};

export function CommodityCards({ commodities, pricesByCommodity, activeCommodity, onSelect }: Props) {
  return (
    <section className="grid commodity-grid">
      {commodities.map((commodity) => {
        const points = pricesByCommodity[commodity.slug];
        const signal = computeSignals(points);
        const badge = signalLabel(signal);
        const active = commodity.slug === activeCommodity;

        return (
          <button
            className={`card card-button ${active ? "active" : ""}`}
            key={commodity.slug}
            onClick={() => onSelect(commodity.slug)}
            type="button"
          >
            <div className="card-head" style={{ borderBottom: 0 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                <span
                  className="chip"
                  style={{ backgroundColor: `${commodity.colorHex}22`, color: commodity.colorHex }}
                >
                  {commodity.symbol}
                </span>
                <div>
                  <h2 style={{ fontSize: 16 }}>{commodity.name}</h2>
                  <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                    {commodity.description}
                  </p>
                </div>
              </div>
              <span className={`badge ${badge.tone}`}>{badge.label}</span>
            </div>

            <div className="price">
              ${signal.latest.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className={signal.changePct >= 0 ? "positive-text" : "negative-text"} style={{ fontSize: 14 }}>
                {" "}
                {signal.changePct >= 0 ? "+" : ""}
                {signal.changePct.toFixed(1)}%
              </span>
            </div>

            <div className="stat-grid">
              <Stat label="14d trend" value={`${signal.trend14d >= 0 ? "+" : ""}${signal.trend14d.toFixed(1)}%`} />
              <Stat label="Volatility" value={`${signal.volatility30d.toFixed(1)}%`} />
              <Stat label="Sentiment" value={signal.averageSentiment.toFixed(2)} />
            </div>
          </button>
        );
      })}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


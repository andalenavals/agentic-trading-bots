"use client";

import { computeSignals, signalLabel } from "@/lib/analytics/signals";
import type { Commodity, CommoditySlug, SentimentPoint } from "@/lib/types";

type Props = {
  activeCommodity: CommoditySlug;
  commodities: Commodity[];
  onSelect: (slug: CommoditySlug) => void;
  pricesByCommodity: Record<CommoditySlug, SentimentPoint[]>;
};

export function CommodityCards({ activeCommodity, commodities, onSelect, pricesByCommodity }: Props) {
  const commodity = commodities.find((item) => item.slug === activeCommodity) ?? commodities[0];
  const signal = computeSignals(pricesByCommodity[commodity.slug]);
  const badge = signalLabel(signal);

  return (
    <section className="panel commodity-picker">
      <label>
        <span>Commodity</span>
        <select value={commodity.slug} onChange={(event) => onSelect(event.target.value as CommoditySlug)}>
          {commodities.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <div className="commodity-summary">
        <span className="chip" style={{ backgroundColor: `${commodity.colorHex}22`, color: commodity.colorHex }}>
          {commodity.symbol}
        </span>
        <div>
          <strong>{commodity.name}</strong>
          <p className="faint">{commodity.description}</p>
        </div>
        <span className={`badge ${badge.tone}`}>{badge.label}</span>
      </div>

      <div className="compact-stat-row">
        <Stat label="Latest" value={`$${signal.latest.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat
          label="Change"
          value={`${signal.changePct >= 0 ? "+" : ""}${signal.changePct.toFixed(1)}%`}
          valueClassName={signal.changePct >= 0 ? "positive-text" : "negative-text"}
        />
        <Stat label="Sentiment" value={signal.averageSentiment.toFixed(2)} />
      </div>
    </section>
  );
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="compact-stat">
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  );
}

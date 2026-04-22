"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import { sourceName } from "@/lib/analytics/news";
import { computeSignals } from "@/lib/analytics/signals";
import type { Commodity, SentimentPoint } from "@/lib/types";

type ChartType = "line" | "area" | "bar";

type Props = {
  commodity: Commodity;
  points: SentimentPoint[];
};

type ChartClickEvent = {
  activePayload?: Array<{ payload?: SentimentPoint }>;
};

const RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 9999 },
];

export function PriceChart({ commodity, points }: Props) {
  const mounted = useClientMounted();
  const [chartType, setChartType] = useState<ChartType>("area");
  const [range, setRange] = useState(365);
  const [selectedPoint, setSelectedPoint] = useState<SentimentPoint | null>(null);
  const filtered = useMemo(() => (range >= 9999 ? points : points.slice(-range)), [points, range]);
  const signal = computeSignals(filtered);
  const chartData = filtered.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString("en-US", { month: "short", year: range >= 365 ? "2-digit" : undefined, day: range < 365 ? "numeric" : undefined }),
  }));
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));
  const displayedSummary = selectedPoint?.newsSummary || signal.latestSummary;

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <span className="chip" style={{ backgroundColor: `${commodity.colorHex}22`, color: commodity.colorHex }}>
            {commodity.symbol}
          </span>
          <div>
            <h2 style={{ fontSize: 17 }}>{commodity.name} price and sentiment</h2>
            <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
              LME price with sentiment context from curated news summaries
            </p>
          </div>
        </div>
        <div className="toolbar">
          <div className="segmented">
            {(["line", "area", "bar"] as ChartType[]).map((type) => (
              <button className={chartType === type ? "active" : ""} key={type} onClick={() => setChartType(type)} type="button">
                {type}
              </button>
            ))}
          </div>
          <div className="segmented">
            {RANGES.map((item) => (
              <button className={range === item.value ? "active" : ""} key={item.label} onClick={() => setRange(item.value)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-box">
        {mounted ? (
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart data={chartData} onClick={(event) => {
              const clicked = (event as ChartClickEvent | undefined)?.activePayload?.[0]?.payload;
              if (clicked) {
                setSelectedPoint(clicked);
              }
            }}>
              <defs>
                <linearGradient id={`price-${commodity.slug}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={commodity.colorHex} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={commodity.colorHex} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#252b3a" vertical={false} />
              <XAxis axisLine={false} dataKey="label" interval={tickInterval} tick={{ fill: "#697185", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} domain={["auto", "auto"]} tick={{ fill: "#697185", fontSize: 11 }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}k`} tickLine={false} width={62} />
              <Tooltip content={<PriceTooltip color={commodity.colorHex} />} />
              <ReferenceLine stroke="#394153" strokeDasharray="4 4" y={signal.average} />
              {chartType === "bar" ? (
                <Bar dataKey="price" fill={commodity.colorHex} opacity={0.78} radius={[3, 3, 0, 0]} />
              ) : chartType === "line" ? (
                <Line dataKey="price" dot={false} stroke={commodity.colorHex} strokeWidth={2} type="monotone" />
              ) : (
                <Area dataKey="price" dot={false} fill={`url(#price-${commodity.slug})`} stroke={commodity.colorHex} strokeWidth={2} type="monotone" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>

      <div className="summary">
        <strong>{selectedPoint ? `Market read for ${new Date(selectedPoint.date).toLocaleDateString()}` : "Latest market read"}:</strong>{" "}
        {displayedSummary || "Click a point in the chart to inspect the news context for that date."}
        {selectedPoint?.newsItems.length ? (
          <div className="clicked-news-list">
            {selectedPoint.newsItems.map((event) => (
              <article className="clicked-news-item" key={event.id}>
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
                        style={{ backgroundColor: `${impacted.colorHex}22`, color: impacted.colorHex, fontSize: 10, height: 24, width: 24 }}
                        title={impacted.name}
                      >
                        {impacted.symbol}
                      </span>
                    );
                  })}
                </div>
                <a href={event.url} rel="noreferrer" target="_blank">{event.title}</a>
                <p>{event.summary}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel-foot">
        <FootStat label="Open" value={`$${signal.open.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <FootStat label="High" value={`$${signal.high.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <FootStat label="Low" value={`$${signal.low.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <FootStat label="Change" value={`${signal.change >= 0 ? "+" : ""}$${signal.change.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <FootStat label="Avg sentiment" value={signal.averageSentiment.toFixed(3)} />
      </div>
    </section>
  );
}

function useClientMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function PriceTooltip({ active, payload, color }: { active?: boolean; payload?: Array<{ payload: SentimentPoint }>; color: string }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className="panel" style={{ maxWidth: 340, padding: 12 }}>
      <p className="faint" style={{ fontSize: 12 }}>{new Date(point.date).toLocaleDateString()}</p>
      <p style={{ color, fontWeight: 800, marginTop: 4 }}>${point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.35, marginTop: 8 }}>Click to show the news context.</p>
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="faint" style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</p>
      <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13 }}>{value}</strong>
    </div>
  );
}

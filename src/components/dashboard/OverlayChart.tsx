"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Commodity, CommoditySlug, SentimentPoint } from "@/lib/types";

type Props = {
  commodities: Commodity[];
  pricesByCommodity: Record<CommoditySlug, SentimentPoint[]>;
};

const RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 9999 },
];

export function OverlayChart({ commodities, pricesByCommodity }: Props) {
  const mounted = useClientMounted();
  const [range, setRange] = useState(365);
  const chartData = useMemo(() => buildOverlayData(commodities, pricesByCommodity, range), [commodities, pricesByCommodity, range]);
  const tickInterval = Math.max(1, Math.floor(chartData.length / 8));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 style={{ fontSize: 17 }}>Relative performance</h2>
          <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
            Percent change normalized to the first point in range
          </p>
        </div>
        <div className="segmented">
          {RANGES.map((item) => (
            <button className={range === item.value ? "active" : ""} key={item.label} onClick={() => setRange(item.value)} type="button">
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-box" style={{ height: 330 }}>
        {mounted ? (
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#252b3a" vertical={false} />
              <XAxis axisLine={false} dataKey="label" interval={tickInterval} tick={{ fill: "#697185", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} tick={{ fill: "#697185", fontSize: 11 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tickLine={false} width={54} />
              <Tooltip
                contentStyle={{ background: "#202536", border: "1px solid #2c3243", borderRadius: 8 }}
                formatter={(value, name) => [`${Number(value).toFixed(2)}%`, commodities.find((commodity) => commodity.slug === name)?.name ?? name]}
                labelStyle={{ color: "#cbd0dc" }}
              />
              <Line dataKey={() => 0} dot={false} legendType="none" stroke="#394153" strokeDasharray="4 4" />
              {commodities.map((commodity) => (
                <Line
                  connectNulls
                  dataKey={commodity.slug}
                  dot={false}
                  key={commodity.slug}
                  stroke={commodity.colorHex}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : null}
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

function buildOverlayData(
  commodities: Commodity[],
  pricesByCommodity: Record<CommoditySlug, SentimentPoint[]>,
  range: number,
) {
  const dates = new Set<string>();
  const indexed: Record<CommoditySlug, Record<string, number>> = {
    copper_lme: {},
    nickel_lme: {},
    aluminium_lme: {},
  };

  for (const commodity of commodities) {
    const points = range >= 9999 ? pricesByCommodity[commodity.slug] : pricesByCommodity[commodity.slug].slice(-range);
    for (const point of points) {
      dates.add(point.date);
      indexed[commodity.slug][point.date] = point.price;
    }
  }

  const sortedDates = Array.from(dates).sort();
  const bases = Object.fromEntries(
    commodities.map((commodity) => {
      const first = sortedDates.find((date) => indexed[commodity.slug][date] !== undefined);
      return [commodity.slug, first ? indexed[commodity.slug][first] : 0];
    }),
  ) as Record<CommoditySlug, number>;

  return sortedDates.map((date) => {
    const row: Record<string, string | number | null> = {
      date,
      label: new Date(date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    };

    for (const commodity of commodities) {
      const price = indexed[commodity.slug][date];
      row[commodity.slug] = price && bases[commodity.slug] ? ((price - bases[commodity.slug]) / bases[commodity.slug]) * 100 : null;
    }

    return row;
  });
}

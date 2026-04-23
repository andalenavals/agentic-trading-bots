"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import { fullXRange, normalizeXRange, zoomXRange } from "@/lib/analytics/chart-zoom";
import type { Commodity, CommoditySlug, SentimentPoint } from "@/lib/types";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";
import type { WheelEvent } from "react";

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
  const [range, setRange] = useState(9999);
  const [chartType, setChartType] = useState<ChartType>("line");
  const [markerSize, setMarkerSize] = useState(4);
  const [markerType, setMarkerType] = useState<MarkerType>("circle");
  const [alphaLevel, setAlphaLevel] = useState(0.7);
  const [logScale, setLogScale] = useState(false);
  const [xRange, setXRange] = useState<{ end: number; start: number } | null>(null);
  const chartData = useMemo(() => buildOverlayData(commodities, pricesByCommodity, range), [commodities, pricesByCommodity, range]);
  const visibleRange = normalizeXRange(xRange ?? fullXRange(chartData.length), chartData.length);
  const visibleData = chartData.slice(visibleRange.start, visibleRange.end + 1);
  const tickInterval = Math.max(1, Math.floor(visibleData.length / 8));

  function handleRangeChange(nextRange: number) {
    setRange(nextRange);
    setXRange(null);
  }

  function handleWheelZoom(event: WheelEvent<HTMLDivElement>) {
    if (!chartData.length) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerRatio = (event.clientX - bounds.left) / bounds.width;
    setXRange((current) => zoomXRange(normalizeXRange(current ?? fullXRange(chartData.length), chartData.length), chartData.length, event.deltaY, pointerRatio));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 style={{ fontSize: 17 }}>Relative performance</h2>
          <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
            Percent change normalized to the first point in range
          </p>
        </div>
      </div>
      <VisualizationControls
        alphaLevel={alphaLevel}
        chartType={chartType}
        markerSize={markerSize}
        markerType={markerType}
        logScale={logScale}
        logScaleDisabled
        range={range}
        ranges={RANGES}
        onAlphaLevelChange={setAlphaLevel}
        onChartTypeChange={setChartType}
        onLogScaleChange={setLogScale}
        onMarkerSizeChange={setMarkerSize}
        onMarkerTypeChange={setMarkerType}
        onRangeChange={handleRangeChange}
      />
      <div className="chart-box" style={{ height: 330 }} onWheel={handleWheelZoom}>
        {mounted ? (
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart data={visibleData}>
              <CartesianGrid stroke="#252b3a" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="x"
                domain={[visibleRange.start, visibleRange.end]}
                interval={tickInterval}
                tick={{ fill: "#697185", fontSize: 11 }}
                tickFormatter={(value) => String(chartData[Math.round(Number(value))]?.label ?? "")}
                tickLine={false}
                type="number"
              />
              <YAxis axisLine={false} tick={{ fill: "#697185", fontSize: 11 }} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tickLine={false} width={54} />
              <Tooltip
                contentStyle={{ background: "#202536", border: "1px solid #2c3243", borderRadius: 8 }}
                formatter={(value, name) => [`${Number(value).toFixed(2)}%`, commodities.find((commodity) => commodity.slug === name)?.name ?? name]}
                labelFormatter={(value) => String(chartData[Math.round(Number(value))]?.label ?? value)}
                labelStyle={{ color: "#cbd0dc" }}
              />
              <Line dataKey={() => 0} dot={false} legendType="none" stroke="#394153" strokeDasharray="4 4" />
              {commodities.map((commodity) => (
                chartType === "bar" ? (
                  <Bar dataKey={commodity.slug} fill={commodity.colorHex} key={commodity.slug} opacity={0.56} radius={[2, 2, 0, 0]} />
                ) : chartType === "area" ? (
                  <Area
                    connectNulls
                    dataKey={commodity.slug}
                    dot={false}
                    fill={`${commodity.colorHex}18`}
                    key={commodity.slug}
                    stroke={commodity.colorHex}
                    strokeWidth={2}
                    type="monotone"
                  />
                ) : (
                  <Line
                    connectNulls
                    dataKey={commodity.slug}
                    dot={false}
                    key={commodity.slug}
                    stroke={commodity.colorHex}
                    strokeWidth={2}
                    type="monotone"
                  />
                )
              ))}
              {commodities.map((commodity) => (
                <Scatter
                  dataKey={commodity.slug}
                  key={`${commodity.slug}-markers`}
                  shape={<PerformanceMarker alphaLevel={alphaLevel} color={commodity.colorHex} markerSize={markerSize} markerType={markerType} />}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </section>
  );
}

function PerformanceMarker({
  alphaLevel,
  color,
  cx,
  cy,
  markerSize,
  markerType,
}: {
  alphaLevel: number;
  color: string;
  cx?: number;
  cy?: number;
  markerSize: number;
  markerType: MarkerType;
}) {
  return <MarkerGlyph alphaLevel={alphaLevel} color={color} cx={cx} cy={cy} markerType={markerType} size={markerSize} />;
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

  return sortedDates.map((date, index) => {
    const row: Record<string, string | number | null> = {
      date,
      label: new Date(date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      x: index,
    };

    for (const commodity of commodities) {
      const price = indexed[commodity.slug][date];
      row[commodity.slug] = price && bases[commodity.slug] ? ((price - bases[commodity.slug]) / bases[commodity.slug]) * 100 : null;
    }

    return row;
  });
}

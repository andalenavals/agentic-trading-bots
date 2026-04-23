"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { TimeSeriesRangeBar } from "@/components/dashboard/TimeSeriesRangeBar";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import { YAxisRangeBar } from "@/components/dashboard/YAxisRangeBar";
import { fullXRange, fullYRange, normalizeXRange, normalizeYRange, xAxisTicks } from "@/lib/analytics/chart-zoom";
import { computeSignals } from "@/lib/analytics/signals";
import type { Commodity, SentimentPoint } from "@/lib/types";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";
import type { YRange } from "@/lib/analytics/chart-zoom";

type Props = {
  commodity: Commodity;
  onSelectPoint: (point: SentimentPoint) => void;
  points: SentimentPoint[];
};

type ChartClickEvent = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: SentimentPoint }>;
  activeTooltipIndex?: number | string;
};

const RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 9999 },
];

export function PriceChart({ commodity, onSelectPoint, points }: Props) {
  const mounted = useClientMounted();
  const hoveredPoint = useRef<SentimentPoint | null>(null);
  const [chartType, setChartType] = useState<ChartType>("area");
  const [range, setRange] = useState(9999);
  const [markerSize, setMarkerSize] = useState(5);
  const [markerType, setMarkerType] = useState<MarkerType>("none");
  const [alphaLevel, setAlphaLevel] = useState(0.72);
  const [logScale, setLogScale] = useState(false);
  const [xRange, setXRange] = useState<{ end: number; start: number } | null>(null);
  const [yRange, setYRange] = useState<YRange | null>(null);
  const filtered = useMemo(() => (range >= 9999 ? points : points.slice(-range)), [points, range]);
  const chartData = filtered.map((point, index) => ({
    ...point,
    x: index,
    label: new Date(point.date).toLocaleDateString("en-US", { month: "short", year: range >= 365 ? "2-digit" : undefined, day: range < 365 ? "numeric" : undefined }),
  }));
  const visibleRange = normalizeXRange(xRange ?? fullXRange(chartData.length), chartData.length);
  const visibleData = chartData.slice(visibleRange.start, visibleRange.end + 1);
  const signal = computeSignals(visibleData);
  const ticks = xAxisTicks(visibleRange);
  const rawYFullRange = fullYRange(chartData.map((point) => point.price));
  const yFullRange = logScale ? { ...rawYFullRange, min: Math.max(0.000001, rawYFullRange.min) } : rawYFullRange;
  const visibleYRange = normalizeYRange(yRange ?? yFullRange, yFullRange);

  function pointFromChartEvent(event: ChartClickEvent | undefined) {
    const payloadPoint = event?.activePayload?.[0]?.payload;
    if (payloadPoint) {
      return payloadPoint;
    }

    const tooltipIndex = Number(event?.activeTooltipIndex);
    if (Number.isInteger(tooltipIndex) && visibleData[tooltipIndex]) {
      return visibleData[tooltipIndex];
    }

    const activeX = Number(event?.activeLabel);
    return visibleData.find((point) => point.x === activeX) ?? null;
  }

  function handleRangeChange(nextRange: number) {
    setRange(nextRange);
    setXRange(null);
    setYRange(null);
  }

  function rememberHoveredPoint(event: ChartClickEvent | undefined) {
    hoveredPoint.current = pointFromChartEvent(event);
  }

  function selectFromChartEvent(event: ChartClickEvent | undefined) {
    const clickedPoint = pointFromChartEvent(event) ?? hoveredPoint.current;
    if (clickedPoint) onSelectPoint(clickedPoint);
  }

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
      </div>

      <VisualizationControls
        alphaLevel={alphaLevel}
        chartType={chartType}
        markerSize={markerSize}
        markerType={markerType}
        logScale={logScale}
        range={range}
        ranges={RANGES}
        onAlphaLevelChange={setAlphaLevel}
        onChartTypeChange={setChartType}
        onLogScaleChange={setLogScale}
        onMarkerSizeChange={setMarkerSize}
        onMarkerTypeChange={setMarkerType}
        onRangeChange={handleRangeChange}
      />

      <div className="chart-y-layout">
        <div className="chart-box">
          {mounted ? (
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                data={visibleData}
                onClick={(event) => selectFromChartEvent(event as ChartClickEvent | undefined)}
                onMouseMove={(event) => rememberHoveredPoint(event as ChartClickEvent | undefined)}
              >
                <defs>
                  <linearGradient id={`price-${commodity.slug}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={commodity.colorHex} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={commodity.colorHex} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252b3a" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="x"
                  domain={[visibleRange.start, visibleRange.end]}
                  tick={{ fill: "#697185", fontSize: 11 }}
                  tickFormatter={(value) => chartData[Math.round(Number(value))]?.label ?? ""}
                  tickLine={false}
                  ticks={ticks}
                  type="number"
                />
                <YAxis
                  allowDataOverflow
                  axisLine={false}
                  domain={[visibleYRange.min, visibleYRange.max]}
                  scale={logScale ? "log" : "auto"}
                  tick={{ fill: "#697185", fontSize: 11 }}
                  tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}k`}
                  tickLine={false}
                  width={62}
                />
                <Tooltip content={<PriceTooltip color={commodity.colorHex} />} />
                <ReferenceLine stroke="#394153" strokeDasharray="4 4" y={signal.average} />
                {chartType === "bar" ? (
                  <Bar dataKey="price" fill={commodity.colorHex} opacity={0.78} radius={[3, 3, 0, 0]} />
                ) : chartType === "line" ? (
                  <Line dataKey="price" dot={false} stroke={commodity.colorHex} strokeWidth={2} type="monotone" />
                ) : (
                  <Area dataKey="price" dot={false} fill={`url(#price-${commodity.slug})`} stroke={commodity.colorHex} strokeWidth={2} type="monotone" />
                )}
                {markerType === "none" ? null : (
                  <Scatter
                    data={visibleData}
                    dataKey="price"
                    shape={<PriceMarker alphaLevel={alphaLevel} color={commodity.colorHex} markerSize={markerSize} markerType={markerType} />}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </div>
        <YAxisRangeBar
          formatter={(value) => `$${(value / 1000).toFixed(1)}k`}
          fullRange={yFullRange}
          range={visibleYRange}
          onChange={setYRange}
        />
      </div>
      <TimeSeriesRangeBar
        labels={chartData.map((point) => point.label)}
        length={chartData.length}
        range={visibleRange}
        onChange={setXRange}
      />
    </section>
  );
}

function PriceMarker({
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

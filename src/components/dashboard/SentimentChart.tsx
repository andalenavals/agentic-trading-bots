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
  XAxis,
  YAxis,
} from "recharts";
import { ChartGestureSurface } from "@/components/dashboard/ChartGestureSurface";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { fullXRange, fullYRange, normalizeXDomain, normalizeXRange, xAxisTicks } from "@/lib/analytics/chart-zoom";
import type { MouseEvent } from "react";
import type { XRange } from "@/lib/analytics/chart-zoom";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";
import type { Commodity, SentimentPoint } from "@/lib/types";

type Props = {
  alphaLevel: number;
  chartType: ChartType;
  commodity: Commodity;
  lineWidth: number;
  markerSize: number;
  markerType: MarkerType;
  points: SentimentPoint[];
  range: number;
  xRange: XRange;
  onXRangeChange: (range: XRange) => void;
};

type SentimentMode = "sentiment" | "finbert";

type ChartClickEvent = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: SentimentChartPoint }>;
  activeTooltipIndex?: number | string;
};

type SentimentChartPoint = SentimentPoint & {
  key: string;
  label: string;
  value: number;
  x: number;
};

const VALUE_AXIS_WIDTH = 58;
const PLOT_RIGHT_PADDING = 6;

export function SentimentChart({
  alphaLevel,
  chartType,
  commodity,
  lineWidth,
  markerSize,
  markerType,
  onXRangeChange,
  points,
  range,
  xRange,
}: Props) {
  const mounted = useClientMounted();
  const hoveredPoint = useRef<SentimentChartPoint | null>(null);
  const [mode, setMode] = useState<SentimentMode>("sentiment");
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);

  const filtered = useMemo(() => (range >= 9999 ? points : points.slice(-range)), [points, range]);
  const chartData = useMemo(
    () =>
      filtered.map((point, index) => ({
        ...point,
        key: `${point.commodity}-${point.date}`,
        label: new Date(point.date).toLocaleDateString("en-US", {
          day: range < 365 ? "numeric" : undefined,
          month: "short",
          year: range >= 365 ? "2-digit" : undefined,
        }),
        value: mode === "finbert" ? point.finbertSentimentScore : point.sentimentScore,
        x: index,
      })),
    [filtered, mode, range],
  );

  const xDomain = normalizeXDomain(xRange ?? fullXRange(chartData.length), chartData.length);
  const visibleRange = normalizeXRange(xDomain, chartData.length);
  const visibleData = chartData.slice(visibleRange.start, visibleRange.end + 1);
  const ticks = xAxisTicks(visibleRange);
  const yValues = (visibleData.length ? visibleData : chartData).map((point) => point.value);
  const rawYRange = fullYRange(yValues.length ? yValues : [0]);
  const selectedPoint = chartData.find((point) => point.key === selectedPointKey) ?? null;

  function pointFromChartEvent(event: ChartClickEvent | undefined) {
    const payloadPoint = event?.activePayload?.[0]?.payload;
    if (payloadPoint) return payloadPoint;

    const tooltipIndex = Number(event?.activeTooltipIndex);
    if (Number.isInteger(tooltipIndex) && chartData[tooltipIndex]) return chartData[tooltipIndex];

    const activeX = Number(event?.activeLabel);
    return chartData.find((point) => point.x === activeX) ?? null;
  }

  function rememberHoveredPoint(event: ChartClickEvent | undefined) {
    hoveredPoint.current = pointFromChartEvent(event);
  }

  function selectFromChartEvent(event: ChartClickEvent | undefined) {
    const clickedPoint = pointFromChartEvent(event) ?? hoveredPoint.current;
    if (clickedPoint) setSelectedPointKey(clickedPoint.key);
  }

  function selectFromSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !chartData.length) return;

    const plotLeft = VALUE_AXIS_WIDTH;
    const plotRight = PLOT_RIGHT_PADDING;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const relativeX = clamp((event.clientX - bounds.left - plotLeft) / plotWidth, 0, 1);
    const index = Math.round(xDomain.start + relativeX * (xDomain.end - xDomain.start));
    const clampedIndex = Math.min(chartData.length - 1, Math.max(0, index));
    setSelectedPointKey(chartData[clampedIndex]?.key ?? null);
  }

  return (
    <section className="sentiment-panel">
      <div className="sentiment-controls">
        <label>
          <span>Sentiment view</span>
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as SentimentMode);
              setSelectedPointKey(null);
            }}
          >
            <option value="sentiment">Simple sentiment</option>
            <option value="finbert">FinBERT</option>
          </select>
        </label>
      </div>
      <ChartGestureSurface
        className="chart-box"
        xLength={chartData.length}
        xRange={xDomain}
        onClick={selectFromSurfaceClick}
        onXChange={onXRangeChange}
      >
        {mounted ? (
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart
              data={chartData}
              onClick={(event) => selectFromChartEvent(event as ChartClickEvent | undefined)}
              onMouseMove={(event) => rememberHoveredPoint(event as ChartClickEvent | undefined)}
            >
              <defs>
                <linearGradient id={`sentiment-${commodity.slug}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={commodity.colorHex} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={commodity.colorHex} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#252b3a" vertical={false} />
              <XAxis
                allowDataOverflow
                axisLine={false}
                dataKey="x"
                domain={[xDomain.start, xDomain.end]}
                tick={{ fill: "#697185", fontSize: 11 }}
                tickFormatter={(value) => chartData[Math.round(Number(value))]?.label ?? ""}
                tickLine={false}
                ticks={ticks}
                type="number"
              />
              <YAxis
                allowDataOverflow
                axisLine={false}
                domain={[Math.min(-1, rawYRange.min), Math.max(1, rawYRange.max)]}
                tick={{ fill: "#697185", fontSize: 11 }}
                tickFormatter={(value) => Number(value).toFixed(2)}
                tickLine={false}
                width={VALUE_AXIS_WIDTH}
              />
              <ReferenceLine stroke="#394153" strokeDasharray="4 4" y={0} />
              {chartType === "bar" ? (
                <Bar dataKey="value" fill={commodity.colorHex} opacity={0.78} radius={[3, 3, 0, 0]} />
              ) : chartType === "line" ? (
                <Line dataKey="value" dot={false} stroke={commodity.colorHex} strokeWidth={lineWidth} type="monotone" />
              ) : (
                <Area dataKey="value" dot={false} fill={`url(#sentiment-${commodity.slug})`} stroke={commodity.colorHex} strokeWidth={lineWidth} type="monotone" />
              )}
              {markerType === "none" ? null : (
                <Scatter
                  data={chartData}
                  dataKey="value"
                  shape={<SentimentMarker alphaLevel={alphaLevel} color={commodity.colorHex} markerSize={markerSize} markerType={markerType} />}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </ChartGestureSurface>
      {selectedPoint ? <SentimentPointState mode={mode} point={selectedPoint} /> : null}
    </section>
  );
}

function SentimentPointState({ mode, point }: { mode: SentimentMode; point: SentimentChartPoint }) {
  const toneClass = point.value > 0.08 ? "positive-text" : point.value < -0.08 ? "negative-text" : "muted";
  const positive = mode === "finbert" ? point.finbertPositive : point.positive;
  const neutral = mode === "finbert" ? point.finbertNeutral : point.neutral;
  const negative = mode === "finbert" ? point.finbertNegative : point.negative;
  const scoreLabel = mode === "finbert" ? "FinBERT sentiment score" : "Simple sentiment score";
  const labelText = mode === "finbert" ? (point.finbertLabel || "n/a").toUpperCase() : "Simple score";

  return (
    <div className="sentiment-state">
      <div className="bot-state-hero">
        <span className="source">{new Date(point.date).toLocaleDateString()}</span>
        <strong className={toneClass}>{point.value.toFixed(3)}</strong>
        <p className="faint">{scoreLabel}</p>
      </div>
      <div className="stat-grid">
        <Stat label="Label" value={labelText} />
        <Stat label="Positive" value={`${(positive * 100).toFixed(1)}%`} />
        <Stat label="Neutral" value={`${(neutral * 100).toFixed(1)}%`} />
        <Stat label="Negative" value={`${(negative * 100).toFixed(1)}%`} />
        <Stat label="News rows" value={String(point.newsCount)} />
      </div>
    </div>
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function SentimentMarker({
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

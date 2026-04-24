"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
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
import { computeSignals } from "@/lib/analytics/signals";
import type { MouseEvent, ReactNode } from "react";
import type { XRange } from "@/lib/analytics/chart-zoom";
import type { Commodity, SentimentPoint } from "@/lib/types";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";

type Props = {
  alphaLevel: number;
  chartType: ChartType;
  commodity: Commodity;
  embedded?: boolean;
  lineWidth: number;
  logScale: boolean;
  markerSize: number;
  markerType: MarkerType;
  onSelectPoint: (point: SentimentPoint) => void;
  points: SentimentPoint[];
  range: number;
  selector?: ReactNode;
  xRange: XRange;
  onXRangeChange: (range: XRange) => void;
};

type ChartClickEvent = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: SentimentPoint }>;
  activeTooltipIndex?: number | string;
};

export function PriceChart({
  alphaLevel,
  chartType,
  commodity,
  embedded = false,
  lineWidth,
  logScale,
  markerSize,
  markerType,
  onSelectPoint,
  onXRangeChange,
  points,
  range,
  selector,
  xRange,
}: Props) {
  const mounted = useClientMounted();
  const hoveredPoint = useRef<SentimentPoint | null>(null);
  const filtered = useMemo(() => (range >= 9999 ? points : points.slice(-range)), [points, range]);
  const chartData = filtered.map((point, index) => ({
    ...point,
    x: index,
    label: new Date(point.date).toLocaleDateString("en-US", { month: "short", year: range >= 365 ? "2-digit" : undefined, day: range < 365 ? "numeric" : undefined }),
  }));
  const xDomain = normalizeXDomain(xRange ?? fullXRange(chartData.length), chartData.length);
  const visibleRange = normalizeXRange(xDomain, chartData.length);
  const visibleData = chartData.slice(visibleRange.start, visibleRange.end + 1);
  const signal = computeSignals(visibleData);
  const ticks = xAxisTicks(visibleRange);
  const rawYRange = fullYRange((visibleData.length ? visibleData : chartData).map((point) => point.price));
  const visibleYRange = logScale ? { ...rawYRange, min: Math.max(0.000001, rawYRange.min) } : rawYRange;

  function pointFromChartEvent(event: ChartClickEvent | undefined) {
    const payloadPoint = event?.activePayload?.[0]?.payload;
    if (payloadPoint) {
      return payloadPoint;
    }

    const tooltipIndex = Number(event?.activeTooltipIndex);
    if (Number.isInteger(tooltipIndex) && chartData[tooltipIndex]) {
      return chartData[tooltipIndex];
    }

    const activeX = Number(event?.activeLabel);
    return chartData.find((point) => point.x === activeX) ?? null;
  }
  function rememberHoveredPoint(event: ChartClickEvent | undefined) {
    hoveredPoint.current = pointFromChartEvent(event);
  }

  function selectFromChartEvent(event: ChartClickEvent | undefined) {
    const clickedPoint = pointFromChartEvent(event) ?? hoveredPoint.current;
    if (clickedPoint) onSelectPoint(clickedPoint);
  }

  function selectFromSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !chartData.length) return;

    const plotLeft = 62;
    const plotRight = 8;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const relativeX = clamp((event.clientX - bounds.left - plotLeft) / plotWidth, 0, 1);
    const index = Math.round(xDomain.start + relativeX * (xDomain.end - xDomain.start));
    const clampedIndex = Math.min(chartData.length - 1, Math.max(0, index));
    onSelectPoint(chartData[clampedIndex]);
  }

  return (
    <section className={embedded ? "market-chart-section" : "panel"}>
      {selector ? (
        <div className="panel-head chart-selector-head">
          {selector}
        </div>
      ) : null}

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
                <linearGradient id={`price-${commodity.slug}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={commodity.colorHex} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={commodity.colorHex} stopOpacity={0.02} />
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
                domain={[visibleYRange.min, visibleYRange.max]}
                scale={logScale ? "log" : "auto"}
                tick={{ fill: "#697185", fontSize: 11 }}
                tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}k`}
                tickLine={false}
                width={62}
              />
              <ReferenceLine stroke="#394153" strokeDasharray="4 4" y={signal.average} />
              {chartType === "bar" ? (
                <Bar dataKey="price" fill={commodity.colorHex} opacity={0.78} radius={[3, 3, 0, 0]} />
              ) : chartType === "line" ? (
                <Line dataKey="price" dot={false} stroke={commodity.colorHex} strokeWidth={lineWidth} type="monotone" />
              ) : (
                <Area dataKey="price" dot={false} fill={`url(#price-${commodity.slug})`} stroke={commodity.colorHex} strokeWidth={lineWidth} type="monotone" />
              )}
              {markerType === "none" ? null : (
                <Scatter
                  data={chartData}
                  dataKey="price"
                  shape={<PriceMarker alphaLevel={alphaLevel} color={commodity.colorHex} markerSize={markerSize} markerType={markerType} />}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </ChartGestureSurface>
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

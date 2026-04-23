"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { TimeSeriesRangeBar } from "@/components/dashboard/TimeSeriesRangeBar";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import { YAxisRangeBar } from "@/components/dashboard/YAxisRangeBar";
import { useAnimatedXRange, useAnimatedYRange } from "@/components/dashboard/useAnimatedRange";
import { fullXRange, fullYRange, normalizeXRange, normalizeYRange, xAxisTicks } from "@/lib/analytics/chart-zoom";
import type { Commodity, CommoditySlug, SentimentPoint } from "@/lib/types";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";

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
  const [markerType, setMarkerType] = useState<MarkerType>("none");
  const [alphaLevel, setAlphaLevel] = useState(0.7);
  const [logScale, setLogScale] = useState(false);
  const xRange = useAnimatedXRange();
  const yRange = useAnimatedYRange();
  const chartData = useMemo(() => buildOverlayData(commodities, pricesByCommodity, range), [commodities, pricesByCommodity, range]);
  const visibleRange = normalizeXRange(xRange.range ?? fullXRange(chartData.length), chartData.length);
  const visibleData = chartData.slice(visibleRange.start, visibleRange.end + 1);
  const ticks = xAxisTicks(visibleRange);
  const yFullRange = fullYRange(
    chartData.flatMap((point) =>
      commodities.map((commodity) => point[commodity.slug]).filter((value): value is number => typeof value === "number"),
    ),
  );
  const visibleYRange = normalizeYRange(yRange.range ?? yFullRange, yFullRange);

  function handleRangeChange(nextRange: number) {
    setRange(nextRange);
    xRange.setImmediate(null);
    yRange.setImmediate(null);
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
      <div className="chart-y-layout">
        <div className="chart-box" style={{ height: 330 }}>
          {mounted ? (
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart data={visibleData}>
                <CartesianGrid stroke="#252b3a" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="x"
                  domain={[visibleRange.start, visibleRange.end]}
                  tick={{ fill: "#697185", fontSize: 11 }}
                  tickFormatter={(value) => String(chartData[Math.round(Number(value))]?.label ?? "")}
                  tickLine={false}
                  ticks={ticks}
                  type="number"
                />
                <YAxis
                  allowDataOverflow
                  axisLine={false}
                  domain={[visibleYRange.min, visibleYRange.max]}
                  tick={{ fill: "#697185", fontSize: 11 }}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                  tickLine={false}
                  width={54}
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
                {markerType === "none"
                  ? null
                  : commodities.map((commodity) => (
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
        <YAxisRangeBar
          formatter={(value) => `${value.toFixed(0)}%`}
          fullRange={yFullRange}
          range={visibleYRange}
          onChange={(nextRange, animated) => (animated ? yRange.setAnimated(nextRange) : yRange.setImmediate(nextRange))}
        />
      </div>
      <TimeSeriesRangeBar
        labels={chartData.map((point) => String(point.label))}
        length={chartData.length}
        range={visibleRange}
        onChange={(nextRange, animated) => (animated ? xRange.setAnimated(nextRange) : xRange.setImmediate(nextRange))}
      />
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

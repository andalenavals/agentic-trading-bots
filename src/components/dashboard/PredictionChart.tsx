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
  Scatter,
  XAxis,
  YAxis,
} from "recharts";
import { ChartGestureSurface } from "@/components/dashboard/ChartGestureSurface";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { fullYRange, normalizeXRange, remapXRange, xAxisTicks } from "@/lib/analytics/chart-zoom";
import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";
import type { XRange } from "@/lib/analytics/chart-zoom";
import type { CommoditySlug, PredictionChartData, PredictionEvaluationMode, PredictionModelKind, PredictionPoint } from "@/lib/types";

type Props = {
  activeCommodity: CommoditySlug;
  alphaLevel: number;
  chartType: ChartType;
  lineWidth: number;
  logScale: boolean;
  markerSize: number;
  markerType: MarkerType;
  onSharedXRangeChange: (range: XRange, chartLength: number) => void;
  predictionChart: PredictionChartData;
  range: number;
  sharedXRange: XRange;
  sharedXRangeLength: number;
};

type ChartClickEvent = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: PredictionChartPoint }>;
  activeTooltipIndex?: number | string;
};

type PredictionChartPoint = PredictionPoint & {
  key: string;
  label: string;
  x: number;
};

const PREDICTION_COLOR = "#f6c85f";
const MODEL_ORDER: PredictionModelKind[] = [
  "lightgbm_sentiment",
  "lightgbm_price_only",
  "ridge_arx_sentiment",
  "ridge_arx_price_only",
  "ar1_baseline",
];
const PRICE_AXIS_WIDTH = 58;
const PLOT_RIGHT_PADDING = 2;

export function PredictionChart({
  activeCommodity,
  alphaLevel,
  chartType,
  lineWidth,
  logScale,
  markerSize,
  markerType,
  onSharedXRangeChange,
  predictionChart,
  range,
  sharedXRange,
  sharedXRangeLength,
}: Props) {
  const mounted = useClientMounted();
  const showMarkers = markerType !== "none";
  const [model, setModel] = useState<PredictionModelKind>("ridge_arx_sentiment");
  const [evaluationMode, setEvaluationMode] = useState<PredictionEvaluationMode>("observed_history");
  const [split, setSplit] = useState(1);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const availableModels = useMemo<PredictionModelKind[]>(() => {
    const models = new Set(predictionChart.points.filter((point) => point.commodity === activeCommodity).map((point) => point.model));
    return models.size
      ? MODEL_ORDER.filter((item) => models.has(item))
      : MODEL_ORDER;
  }, [activeCommodity, predictionChart.points]);
  const activeModel = availableModels.includes(model) ? model : availableModels[0];
  const availableModes = useMemo<PredictionEvaluationMode[]>(() => {
    const modes = new Set(
      predictionChart.points
        .filter((point) => point.model === activeModel && point.commodity === activeCommodity)
        .map((point) => point.evaluationMode),
    );
    return modes.size ? Array.from(modes).sort() as PredictionEvaluationMode[] : [activeModel === "ar1_baseline" ? "recursive_path" : "observed_history"];
  }, [activeCommodity, activeModel, predictionChart.points]);
  const activeEvaluationMode = availableModes.includes(evaluationMode) ? evaluationMode : availableModes[0];

  const splitOptions = useMemo(() => {
    const splits = new Set(
      predictionChart.points
        .filter((point) => point.model === activeModel && point.evaluationMode === activeEvaluationMode && point.commodity === activeCommodity)
        .map((point) => point.split),
    );
    return splits.size ? Array.from(splits).sort((a, b) => a - b) : [split];
  }, [activeCommodity, activeEvaluationMode, activeModel, predictionChart.points, split]);
  const activeSplit = splitOptions.includes(split) ? split : splitOptions[0];

  const chartPoints = useMemo(
    () =>
      predictionChart.points
        .filter((point) => (
          point.model === activeModel
          && point.evaluationMode === activeEvaluationMode
          && point.commodity === activeCommodity
          && point.split === activeSplit
        ))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((point, index) => ({
          ...point,
          key: `${point.model}-${point.commodity}-${point.split}-${point.datasetIndex}-${point.date}`,
          label: new Date(point.date).toLocaleDateString("en-US", {
            day: range < 365 ? "numeric" : undefined,
            month: "short",
            year: range >= 365 ? "2-digit" : undefined,
          }),
          x: index,
        })),
    [activeCommodity, activeEvaluationMode, activeModel, activeSplit, predictionChart.points, range],
  );

  const displayedPoints = useMemo(
    () => (range >= 99999 ? chartPoints : chartPoints.slice(-range).map((point, index) => ({ ...point, x: index }))),
    [chartPoints, range],
  );
  const xDomain = remapXRange(sharedXRange, sharedXRangeLength, displayedPoints.length);
  const visibleRange = normalizeXRange(xDomain, displayedPoints.length);
  const visiblePoints = displayedPoints.slice(visibleRange.start, visibleRange.end + 1);
  const ticks = xAxisTicks(visibleRange);
  const values = (visiblePoints.length ? visiblePoints : displayedPoints).flatMap((point) =>
    point.predictedPrice === null ? [point.price] : [point.price, point.predictedPrice],
  );
  const rawYRange = fullYRange(values);
  const visibleYRange = logScale ? { ...rawYRange, min: Math.max(0.000001, rawYRange.min) } : rawYRange;
  const commodity = COMMODITY_LOOKUP[activeCommodity];
  const testStart = displayedPoints.find((point) => point.phase === "test");
  const selectedPoint = chartPoints.find((point) => point.key === selectedPointKey) ?? null;

  function pointFromChartEvent(event: ChartClickEvent | undefined) {
    const payloadPoint = event?.activePayload?.[0]?.payload;
    if (payloadPoint) return payloadPoint;

    const tooltipIndex = Number(event?.activeTooltipIndex);
    if (Number.isInteger(tooltipIndex) && displayedPoints[tooltipIndex]) return displayedPoints[tooltipIndex];

    const activeX = Number(event?.activeLabel);
    return displayedPoints.find((point) => point.x === activeX) ?? null;
  }

  function selectPoint(point: PredictionChartPoint | null) {
    if (!point || point.predictedPrice === null) {
      setSelectedPointKey(null);
      return;
    }
    setSelectedPointKey(point.key);
  }

  function selectFromSurfaceClick(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !displayedPoints.length) return;

    const plotLeft = PRICE_AXIS_WIDTH;
    const plotRight = PLOT_RIGHT_PADDING;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const relativeX = Math.min(1, Math.max(0, (event.clientX - bounds.left - plotLeft) / plotWidth));
    const index = Math.round(xDomain.start + relativeX * (xDomain.end - xDomain.start));
    const clampedIndex = Math.min(displayedPoints.length - 1, Math.max(0, index));
    selectPoint(displayedPoints[clampedIndex] ?? null);
  }

  return (
    <section className="agent-gym">
      <div className="gym-controls">
        <Control label="Model">
          <select
            value={activeModel}
            onChange={(event) => {
              setModel(event.target.value as PredictionModelKind);
              setSelectedPointKey(null);
            }}
          >
            {availableModels.map((item) => (
              <option key={item} value={item}>{modelLabel(item)}</option>
            ))}
          </select>
        </Control>
        {availableModes.length > 1 ? (
          <Control label="Evaluation">
            <select
              value={activeEvaluationMode}
              onChange={(event) => {
                setEvaluationMode(event.target.value as PredictionEvaluationMode);
                setSelectedPointKey(null);
              }}
            >
              {availableModes.map((item) => (
                <option key={item} value={item}>{evaluationModeLabel(item)}</option>
              ))}
            </select>
          </Control>
        ) : null}
        <Control label="Split">
          <select value={activeSplit} onChange={(event) => setSplit(Number(event.target.value))}>
            {splitOptions.map((item) => (
              <option key={item} value={item}>Split {item}</option>
            ))}
          </select>
        </Control>
      </div>
      <ChartGestureSurface
        className="chart-box gym-chart"
        style={{ height: 390 }}
        onClick={selectFromSurfaceClick}
        xLength={displayedPoints.length}
        xRange={xDomain}
        onXChange={(nextRange) => onSharedXRangeChange(nextRange, displayedPoints.length)}
      >
        {displayedPoints.length === 0 ? (
          <div className="empty-state">
            <h3>No predictions generated yet</h3>
            <p>
              Run <code>npm run predict:ridge</code> or <code>npm run predict:baseline</code> to generate forecast files under{" "}
              <code>data/prediction_outputs</code>.
            </p>
          </div>
        ) : mounted ? (
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart
              data={displayedPoints}
              margin={{ bottom: 0, left: 0, right: 0, top: 0 }}
              onClick={(event) => selectPoint(pointFromChartEvent(event as ChartClickEvent | undefined))}
            >
              <CartesianGrid stroke="#252b3a" vertical={false} />
              <XAxis
                allowDataOverflow
                axisLine={false}
                dataKey="x"
                domain={[xDomain.start, xDomain.end]}
                tick={{ fill: "#697185", fontSize: 11 }}
                tickFormatter={(value) => displayedPoints[Math.round(Number(value))]?.label ?? ""}
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
                width={PRICE_AXIS_WIDTH}
              />
              {chartType === "bar" ? (
                <Bar dataKey="price" fill={commodity.colorHex} isAnimationActive={false} opacity={0.42} radius={[3, 3, 0, 0]} />
              ) : chartType === "area" ? (
                <Area
                  dataKey="price"
                  dot={false}
                  fill={`${commodity.colorHex}22`}
                  fillOpacity={0.45}
                  isAnimationActive={false}
                  stroke={commodity.colorHex}
                  strokeOpacity={0.62}
                  strokeWidth={lineWidth}
                  type="monotone"
                />
              ) : (
                <Line dataKey="price" dot={false} isAnimationActive={false} stroke={commodity.colorHex} strokeOpacity={0.62} strokeWidth={lineWidth} type="monotone" />
              )}
              <Line
                connectNulls={false}
                dataKey="predictedPrice"
                dot={false}
                isAnimationActive={false}
                stroke={PREDICTION_COLOR}
                strokeDasharray="6 4"
                strokeWidth={lineWidth}
                type="monotone"
              />
              {testStart ? (
                <ReferenceLine
                  ifOverflow="extendDomain"
                  label={{ fill: "#b6bdcf", fontSize: 11, position: "insideTopRight", value: "test" }}
                  stroke="#f6c85f"
                  strokeDasharray="5 5"
                  x={testStart.x}
                />
              ) : null}
              {showMarkers ? (
                <>
                  <Scatter
                    data={displayedPoints}
                    dataKey="price"
                    isAnimationActive={false}
                    shape={<SeriesMarker alphaLevel={alphaLevel} color={commodity.colorHex} markerSize={markerSize} markerType={markerType} />}
                  />
                  <Scatter
                    data={displayedPoints.filter((point) => point.predictedPrice !== null)}
                    dataKey="predictedPrice"
                    isAnimationActive={false}
                    shape={<SeriesMarker alphaLevel={alphaLevel} color={PREDICTION_COLOR} markerSize={markerSize} markerType={markerType} />}
                  />
                </>
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </ChartGestureSurface>
      {selectedPoint && selectedPoint.predictedPrice !== null ? <PredictionPointState model={activeModel} point={selectedPoint} /> : null}
    </section>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function PredictionPointState({ model, point }: { model: PredictionModelKind; point: PredictionChartPoint }) {
  const metadata = modelMetadata(model, point);
  return (
    <div className="chart-detail-panel">
      <div className="bot-state-hero">
        <span className="source">{new Date(point.date).toLocaleDateString()}</span>
        <strong style={{ color: PREDICTION_COLOR }}>
          ${point.predictedPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </strong>
        <p className="faint">{evaluationModeLabel(point.evaluationMode)}</p>
      </div>
      <div className="stat-grid">
        <Stat label="Actual" value={`$${point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat label="Forecast" value={`$${point.predictedPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat label="Error" value={formatSigned(point.error)} />
        <Stat label="Abs error" value={`$${point.absoluteError?.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat label={metadata[0].label} value={metadata[0].value} />
        <Stat label={metadata[1].label} value={metadata[1].value} />
      </div>
    </div>
  );
}

function modelLabel(model: PredictionModelKind) {
  if (model === "lightgbm_sentiment") return "LightGBM (Price + sentiment)";
  if (model === "lightgbm_price_only") return "LightGBM (Price only)";
  if (model === "ridge_arx_sentiment") return "Ridge ARX (Price + sentiment)";
  if (model === "ridge_arx_price_only") return "Ridge ARX (Price only)";
  return "Trend baseline";
}

function evaluationModeLabel(mode: PredictionEvaluationMode) {
  if (mode === "observed_history") return "Observed history";
  return "Recursive path";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatSigned(value: number | null) {
  if (value === null) return "n/a";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function modelMetadata(model: PredictionModelKind, point: PredictionChartPoint) {
  if (model === "ridge_arx_price_only" || model === "ridge_arx_sentiment") {
    return [
      { label: "Intercept", value: point.alpha.toFixed(6) },
      { label: "Lag1 coeff", value: point.beta.toFixed(6) },
    ];
  }

  if (model === "lightgbm_price_only" || model === "lightgbm_sentiment") {
    return [
      { label: "Trees", value: String(Math.round(point.alpha)) },
      { label: "Leaves", value: String(Math.round(point.beta)) },
    ];
  }

  return [
    { label: "Anchor", value: `$${point.alpha.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
    { label: "Slope", value: point.beta.toFixed(6) },
  ];
}

function SeriesMarker({
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

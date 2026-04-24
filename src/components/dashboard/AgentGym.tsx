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
import type {
  AgentActionName,
  AgentDecisionPoint,
  AgentGymData,
  AgentModelKind,
  Commodity,
  CommoditySlug,
} from "@/lib/types";

type Props = {
  alphaLevel: number;
  activeCommodity: CommoditySlug;
  agentGym: AgentGymData;
  chartType: ChartType;
  commodities: Commodity[];
  lineWidth: number;
  logScale: boolean;
  markerSize: number;
  markerType: MarkerType;
  onSharedXRangeChange: (range: XRange, chartLength: number) => void;
  range: number;
  sharedXRange: XRange;
  sharedXRangeLength: number;
};

type ChartClickEvent = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: AgentChartPoint }>;
  activeTooltipIndex?: number | string;
};

const ACTION_COLOR: Record<AgentActionName, string> = {
  hold: "#f6c85f",
  buy: "#4caf50",
  sell: "#ef5350",
};

const PRICE_AXIS_WIDTH = 58;
const PLOT_RIGHT_PADDING = 2;

export function AgentGym({
  alphaLevel,
  activeCommodity: selectedCommodity,
  agentGym,
  chartType,
  commodities,
  lineWidth,
  logScale,
  markerSize,
  markerType,
  onSharedXRangeChange,
  range,
  sharedXRange,
  sharedXRangeLength,
}: Props) {
  const mounted = useClientMounted();
  const [model, setModel] = useState<AgentModelKind>("single_asset_ppo");
  const [split, setSplit] = useState(1);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [showSetupPanel, setShowSetupPanel] = useState(false);

  const availableCommodities = useMemo(() => {
    const slugs = new Set(
      agentGym.points
        .filter((point) => point.model === model && point.dataset === "full")
        .map((point) => point.commodity),
    );
    return commodities.filter((item) => slugs.has(item.slug));
  }, [agentGym.points, commodities, model]);
  const activeCommoditySlug = availableCommodities.some((item) => item.slug === selectedCommodity)
    ? selectedCommodity
    : availableCommodities[0]?.slug ?? selectedCommodity;

  const splitOptions = useMemo(() => {
    const splits = new Set(
      agentGym.points
        .filter((point) => point.model === model && point.dataset === "full" && point.commodity === activeCommoditySlug)
        .map((point) => point.split),
    );
    return splits.size ? Array.from(splits).sort((a, b) => a - b) : [split];
  }, [activeCommoditySlug, agentGym.points, model, split]);
  const activeSplit = splitOptions.includes(split) ? split : splitOptions[0];

  const matching = useMemo(
    () =>
      agentGym.points.filter(
        (point) =>
          point.model === model &&
          point.dataset === "full" &&
          point.split === activeSplit &&
          point.commodity === activeCommoditySlug,
      ),
    [activeCommoditySlug, activeSplit, agentGym.points, model],
  );

  const splitCount = splitOptions[splitOptions.length - 1] ?? 1;
  const chartPoints = useMemo(
    () => buildChartPoints(matching, activeSplit, splitCount),
    [activeSplit, matching, splitCount],
  );
  const displayedPoints = useMemo(
    () => (range >= 99999 ? chartPoints : chartPoints.slice(-range).map((point, index) => ({ ...point, x: index }))),
    [chartPoints, range],
  );
  const xDomain = remapXRange(sharedXRange, sharedXRangeLength, displayedPoints.length);
  const visibleRange = normalizeXRange(xDomain, displayedPoints.length);
  const visiblePoints = displayedPoints.slice(visibleRange.start, visibleRange.end + 1);
  const ticks = xAxisTicks(visibleRange);
  const rawYRange = fullYRange((visiblePoints.length ? visiblePoints : displayedPoints).map((point) => point.price));
  const visibleYRange = logScale ? { ...rawYRange, min: Math.max(0.000001, rawYRange.min) } : rawYRange;
  const activeCommodity = COMMODITY_LOOKUP[activeCommoditySlug];
  const testStart = displayedPoints.find((point) => point.phase === "test");
  const selectedPoint = chartPoints.find((point) => point.key === selectedPointKey) ?? null;

  function pointFromChartEvent(event: ChartClickEvent | undefined) {
    const payloadPoint = event?.activePayload?.[0]?.payload;
    if (payloadPoint) return payloadPoint;

    const tooltipIndex = Number(event?.activeTooltipIndex);
    if (Number.isInteger(tooltipIndex) && displayedPoints[tooltipIndex]) return displayedPoints[tooltipIndex];

    const activeX = Number(event?.activeLabel);
    const pointByX = displayedPoints.find((point) => point.x === activeX);
    if (pointByX) return pointByX;

    return null;
  }

  function handleModelChange(nextModel: AgentModelKind) {
    setModel(nextModel);
    setSelectedPointKey(null);
  }

  function handleSplitChange(nextSplit: number) {
    setSplit(nextSplit);
    setSelectedPointKey(null);
  }

  function selectFromSurfaceClick(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !displayedPoints.length) return;

    const plotLeft = PRICE_AXIS_WIDTH;
    const plotRight = PLOT_RIGHT_PADDING;
    const plotWidth = Math.max(1, bounds.width - plotLeft - plotRight);
    const relativeX = clamp((event.clientX - bounds.left - plotLeft) / plotWidth, 0, 1);
    const index = Math.round(xDomain.start + relativeX * (xDomain.end - xDomain.start));
    const clampedIndex = Math.min(displayedPoints.length - 1, Math.max(0, index));
    setSelectedPointKey(displayedPoints[clampedIndex]?.key ?? null);
  }

  return (
    <section className="agent-gym">
      <div className="chart-window-shell">
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
              <h3>No bot decisions generated yet</h3>
              <p>
                Run <code>npm run train:single</code> or <code>npm run train:multi</code> to generate files under <code>data/agent_outputs</code>.
                The app only requires raw data in Git; bot outputs are generated artifacts.
              </p>
            </div>
          ) : mounted ? (
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                data={displayedPoints}
                margin={{ bottom: 0, left: 0, right: 0, top: 0 }}
                onClick={(event) => {
                  const point = pointFromChartEvent(event as ChartClickEvent | undefined);
                  if (point) setSelectedPointKey(point.key);
                }}
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
                  <Bar dataKey="price" fill={activeCommodity.colorHex} isAnimationActive={false} opacity={0.62} radius={[3, 3, 0, 0]} />
                ) : chartType === "area" ? (
                  <Area dataKey="price" dot={false} fill={`${activeCommodity.colorHex}22`} isAnimationActive={false} stroke={activeCommodity.colorHex} strokeWidth={lineWidth} type="monotone" />
                ) : (
                  <Line dataKey="price" dot={false} isAnimationActive={false} stroke={activeCommodity.colorHex} strokeWidth={lineWidth} type="monotone" />
                )}
                {testStart ? (
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    label={{ fill: "#b6bdcf", fontSize: 11, position: "insideTopRight", value: "test" }}
                    stroke="#f6c85f"
                    strokeDasharray="5 5"
                    x={testStart.x}
                  />
                ) : null}
                {markerType === "none"
                  ? null
                  : (["hold", "buy", "sell"] as AgentActionName[]).map((actionName) => (
                      <Scatter
                        data={displayedPoints.filter((point) => point.actionName === actionName)}
                        dataKey="price"
                        isAnimationActive={false}
                        key={actionName}
                        shape={<DecisionDot alphaLevel={alphaLevel} markerSize={markerSize} markerType={markerType} />}
                      />
                    ))}
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </ChartGestureSurface>
        {selectedPoint ? <BotPointState point={selectedPoint} /> : null}
        {showSetupPanel ? (
          <div className="chart-drawer-panel chart-drawer-panel-controls">
            <div className="gym-controls">
              <Control label="Model">
                <select value={model} onChange={(event) => handleModelChange(event.target.value as AgentModelKind)}>
                  <option value="single_asset_ppo">Single asset PPO</option>
                  <option value="multiple_asset_ppo">Multi asset PPO</option>
                </select>
              </Control>
              <Control label="Split">
                <select value={activeSplit} onChange={(event) => handleSplitChange(Number(event.target.value))}>
                  {splitOptions.map((item) => (
                    <option key={item} value={item}>Split {item}</option>
                  ))}
                </select>
              </Control>
            </div>
          </div>
        ) : null}
        <div className="chart-drawer-tabs">
          <button
            aria-expanded={showSetupPanel}
            className={`chart-drawer-handle${showSetupPanel ? " open" : ""}`}
            onClick={() => setShowSetupPanel((current) => !current)}
            type="button"
          >
            <span>Decision setup</span>
            <strong aria-hidden="true">{showSetupPanel ? "\u25B4" : "\u25BE"}</strong>
          </button>
        </div>
      </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BotPointState({ point }: { point: AgentChartPoint }) {
  return (
    <div className="chart-detail-panel">
      <div className="bot-state-hero">
        <span className="source">{point.phase}</span>
        <strong style={{ color: ACTION_COLOR[point.actionName] }}>{point.actionName}</strong>
        <p className="faint">{(point.confidence * 100).toFixed(1)}% confidence</p>
      </div>
      <div className="decision-probabilities">
        <ProbabilityBar color={ACTION_COLOR.hold} label="Hold" value={point.probHold} />
        <ProbabilityBar color={ACTION_COLOR.buy} label="Buy" value={point.probBuy} />
        <ProbabilityBar color={ACTION_COLOR.sell} label="Sell" value={point.probSell} />
      </div>
      <div className="stat-grid">
        <Stat label="Price" value={`$${point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat label="Uncertainty" value={`${(point.uncertainty * 100).toFixed(1)}%`} />
        <Stat label="Net worth" value={`$${point.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="Reward" value={point.reward.toFixed(4)} />
        <Stat label="Position" value={point.position === null ? "n/a" : point.position.toLocaleString()} />
      </div>
    </div>
  );
}

function ProbabilityBar({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="probability-row">
      <div>
        <strong>{label}</strong>
        <span>{(value * 100).toFixed(1)}%</span>
      </div>
      <span className="probability-track">
        <span style={{ backgroundColor: color, width: `${Math.max(1, value * 100)}%` }} />
      </span>
    </div>
  );
}

type AgentChartPoint = AgentDecisionPoint & {
  key: string;
  label: string;
  uncertainty: number;
  x: number;
};

function buildChartPoints(points: AgentDecisionPoint[], activeSplit: number, splitCount: number): AgentChartPoint[] {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const fallbackBoundary = Math.floor(ordered.length * (activeSplit / (splitCount + 1)));

  return ordered.map((point, index) => ({
    ...point,
    key: `${point.model}-${point.commodity}-${point.split}-${point.datasetIndex}-${point.date}`,
    label: new Date(point.date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" }),
    phase: point.phase === "test" || index >= fallbackBoundary ? "test" : "train",
    uncertainty: point.normalizedEntropy || 1 - point.confidence,
    x: index,
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function DecisionDot(props: { alphaLevel?: number; cx?: number; cy?: number; markerSize?: number; markerType?: MarkerType; payload?: AgentChartPoint }) {
  if (props.cx === undefined || props.cy === undefined || !props.payload) return <g />;
  const opacity = Math.max(0.15, Math.min(1, (props.alphaLevel ?? 1) * Math.max(0.18, props.payload.confidence)));
  const radius = (props.markerSize ?? 6) + props.payload.confidence * 2;
  const color = ACTION_COLOR[props.payload.actionName];

  return <MarkerGlyph alphaLevel={opacity} color={color} cx={props.cx} cy={props.cy} markerType={props.markerType ?? "circle"} size={radius} strokeWidth={1.5} />;
}

function useClientMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

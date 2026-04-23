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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartGestureSurface } from "@/components/dashboard/ChartGestureSurface";
import { MarkerGlyph } from "@/components/dashboard/MarkerGlyph";
import { TimeSeriesRangeBar } from "@/components/dashboard/TimeSeriesRangeBar";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import { YAxisRangeBar } from "@/components/dashboard/YAxisRangeBar";
import { useAnimatedXRange, useAnimatedYRange } from "@/components/dashboard/useAnimatedRange";
import { fullXRange, fullYRange, normalizeXDomain, normalizeXRange, normalizeYRange, xAxisTicks } from "@/lib/analytics/chart-zoom";
import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";
import type {
  AgentActionName,
  AgentDecisionPoint,
  AgentGymData,
  AgentModelKind,
  Commodity,
  CommoditySlug,
} from "@/lib/types";

type Props = {
  agentGym: AgentGymData;
  commodities: Commodity[];
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

const RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 99999 },
];

export function AgentGym({ agentGym, commodities }: Props) {
  const mounted = useClientMounted();
  const [model, setModel] = useState<AgentModelKind>("single_asset_ppo");
  const [split, setSplit] = useState(1);
  const [commodity, setCommodity] = useState<CommoditySlug>("copper_lme");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [range, setRange] = useState(99999);
  const [markerSize, setMarkerSize] = useState(6);
  const [markerType, setMarkerType] = useState<MarkerType>("none");
  const [alphaLevel, setAlphaLevel] = useState(0.88);
  const [logScale, setLogScale] = useState(false);
  const xRange = useAnimatedXRange();
  const yRange = useAnimatedYRange();
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);

  const availableCommodities = useMemo(() => {
    const slugs = new Set(
      agentGym.points
        .filter((point) => point.model === model && point.dataset === "full")
        .map((point) => point.commodity),
    );
    return commodities.filter((item) => slugs.has(item.slug));
  }, [agentGym.points, commodities, model]);
  const activeCommoditySlug = availableCommodities.some((item) => item.slug === commodity)
    ? commodity
    : availableCommodities[0]?.slug ?? commodity;

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
  const xDomain = normalizeXDomain(xRange.range ?? fullXRange(displayedPoints.length), displayedPoints.length);
  const visibleRange = normalizeXRange(xDomain, displayedPoints.length);
  const ticks = xAxisTicks(visibleRange);
  const rawYFullRange = fullYRange(displayedPoints.map((point) => point.price));
  const yFullRange = logScale ? { ...rawYFullRange, min: Math.max(0.000001, rawYFullRange.min) } : rawYFullRange;
  const visibleYRange = normalizeYRange(yRange.range ?? yFullRange, yFullRange);
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
    xRange.setImmediate(null);
    yRange.setImmediate(null);
  }

  function handleSplitChange(nextSplit: number) {
    setSplit(nextSplit);
    setSelectedPointKey(null);
    xRange.setImmediate(null);
    yRange.setImmediate(null);
  }

  function handleCommodityChange(nextCommodity: CommoditySlug) {
    setCommodity(nextCommodity);
    setSelectedPointKey(null);
    xRange.setImmediate(null);
    yRange.setImmediate(null);
  }

  function handleRangeChange(nextRange: number) {
    setRange(nextRange);
    setSelectedPointKey(null);
    xRange.setImmediate(null);
    yRange.setImmediate(null);
  }

  return (
    <section className="agent-gym">
      <div className="panel-head">
        <div>
          <h2 style={{ fontSize: 19 }}>Trading bots gym</h2>
          <p className="faint" style={{ fontSize: 12, marginTop: 3 }}>
            Inspect the price series with trained PPO decisions overlaid. Marker opacity represents decision confidence, so faint marks are uncertain.
          </p>
        </div>
        <div className="tag-row">
          <span className="source">single + multi PPO</span>
          <span className="source">{agentGym.sources.length} output files</span>
        </div>
      </div>

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
        <Control label="Commodity">
          <select value={activeCommoditySlug} onChange={(event) => handleCommodityChange(event.target.value as CommoditySlug)}>
            {(availableCommodities.length ? availableCommodities : commodities).map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </Control>
      </div>

      <div className="gym-layout">
        <div className="panel gym-chart">
          <div className="panel-head">
            <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
              <span className="chip" style={{ backgroundColor: `${activeCommodity.colorHex}22`, color: activeCommodity.colorHex }}>
                {activeCommodity.symbol}
              </span>
              <div>
                <h3 style={{ fontSize: 15 }}>Price series with bot decisions</h3>
                <p className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                  Full diagnostic series with a vertical split between training history and out-of-sample test period
                </p>
              </div>
            </div>
            <Legend />
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
            <ChartGestureSurface
              className="chart-box"
              fullYRange={yFullRange}
              style={{ height: 390 }}
              xLength={displayedPoints.length}
              xRange={xDomain}
              yRange={visibleYRange}
              onXChange={xRange.setImmediate}
              onYChange={yRange.setImmediate}
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
                      width={62}
                    />
                    <Tooltip content={<AgentTooltip />} />
                    {chartType === "bar" ? (
                      <Bar dataKey="price" fill={activeCommodity.colorHex} opacity={0.62} radius={[3, 3, 0, 0]} />
                    ) : chartType === "area" ? (
                      <Area dataKey="price" dot={false} fill={`${activeCommodity.colorHex}22`} stroke={activeCommodity.colorHex} strokeWidth={2} type="monotone" />
                    ) : (
                      <Line dataKey="price" dot={false} stroke={activeCommodity.colorHex} strokeWidth={2} type="monotone" />
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
                            key={actionName}
                            shape={<DecisionDot alphaLevel={alphaLevel} markerSize={markerSize} markerType={markerType} />}
                          />
                        ))}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
            </ChartGestureSurface>
            <YAxisRangeBar
              formatter={(value) => `$${(value / 1000).toFixed(1)}k`}
              fullRange={yFullRange}
              range={visibleYRange}
              onChange={(nextRange, animated) => (animated ? yRange.setAnimated(nextRange, visibleYRange) : yRange.setImmediate(nextRange))}
            />
          </div>
          <TimeSeriesRangeBar
            labels={displayedPoints.map((point) => point.label)}
            length={displayedPoints.length}
            range={visibleRange}
            onChange={(nextRange, animated) => (animated ? xRange.setAnimated(nextRange, visibleRange) : xRange.setImmediate(nextRange))}
          />
        </div>

        <div className="panel gym-side">
          <div className="panel-head">
            <div>
              <h3 style={{ fontSize: 15 }}>Clicked decision state</h3>
              <p className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                {selectedPoint ? `${activeCommodity.name} on ${selectedPoint.label}` : "Click a decision marker in the time series"}
              </p>
            </div>
            {selectedPoint ? <span className="badge neutral">{selectedPoint.phase}</span> : null}
          </div>
          {selectedPoint ? (
            <BotPointState point={selectedPoint} />
          ) : (
            <div className="empty-state">
              <h3>No decision selected</h3>
              <p>Decision state appears here only after clicking a buy, hold, or sell marker in the chart.</p>
            </div>
          )}
          <div className="gym-note">
            <strong>Included training code</strong>
            <p>
              Python PPO trainers live in `agentic_trading/training` and read configs from `configs/agents`. This panel uses full-dataset diagnostic outputs; the vertical line marks where the out-of-sample test period begins for the selected split.
            </p>
          </div>
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

function Legend() {
  return (
    <div className="tag-row">
      {(["hold", "buy", "sell"] as AgentActionName[]).map((name) => (
        <span className="legend-item" key={name}>
          <span style={{ backgroundColor: ACTION_COLOR[name] }} />
          {name}
        </span>
      ))}
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

function BotPointState({ point }: { point: AgentChartPoint }) {
  return (
    <div style={{ display: "grid", gap: 14, padding: 18 }}>
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

function AgentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AgentChartPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;

  return (
    <div className="panel" style={{ minWidth: 220, padding: 12 }}>
      <p className="faint" style={{ fontSize: 12 }}>{point.label}</p>
      <p style={{ fontWeight: 800, marginTop: 4 }}>${point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      <p style={{ color: ACTION_COLOR[point.actionName], fontSize: 12, fontWeight: 800, marginTop: 8, textTransform: "uppercase" }}>
        {point.actionName} · {(point.confidence * 100).toFixed(1)}% confidence
      </p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>
        Hold {(point.probHold * 100).toFixed(1)}% · Buy {(point.probBuy * 100).toFixed(1)}% · Sell {(point.probSell * 100).toFixed(1)}%
      </p>
      <p className="faint" style={{ fontSize: 11, marginTop: 8, textTransform: "uppercase" }}>{point.phase}</p>
    </div>
  );
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

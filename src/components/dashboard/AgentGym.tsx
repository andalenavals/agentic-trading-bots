"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
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
import { COMMODITY_LOOKUP } from "@/lib/analytics/commodities";
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
  activePayload?: Array<{ payload?: AgentChartPoint }>;
};

const ACTION_COLOR: Record<AgentActionName, string> = {
  hold: "#f6c85f",
  buy: "#4caf50",
  sell: "#ef5350",
};

export function AgentGym({ agentGym, commodities }: Props) {
  const mounted = useClientMounted();
  const [model, setModel] = useState<AgentModelKind>("single_asset_ppo");
  const [split, setSplit] = useState(1);
  const [commodity, setCommodity] = useState<CommoditySlug>("copper_lme");
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
  const stats = useMemo(() => summarizeAgentPoints(chartPoints), [chartPoints]);
  const activeCommodity = COMMODITY_LOOKUP[activeCommoditySlug];
  const testStart = chartPoints.find((point) => point.phase === "test");
  const selectedPoint = chartPoints.find((point) => point.key === selectedPointKey) ?? null;

  function handleModelChange(nextModel: AgentModelKind) {
    setModel(nextModel);
    setSelectedPointKey(null);
  }

  function handleSplitChange(nextSplit: number) {
    setSplit(nextSplit);
    setSelectedPointKey(null);
  }

  function handleCommodityChange(nextCommodity: CommoditySlug) {
    setCommodity(nextCommodity);
    setSelectedPointKey(null);
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
          <div className="chart-box" style={{ height: 390 }}>
            {chartPoints.length === 0 ? (
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
                  data={chartPoints}
                  onClick={(event) => {
                    const point = ((event as ChartClickEvent | undefined)?.activePayload?.[0]?.payload ?? null);
                    if (point) setSelectedPointKey(point.key);
                  }}
                >
                  <CartesianGrid stroke="#252b3a" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="x"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "#697185", fontSize: 11 }}
                    tickFormatter={(value) => chartPoints[Math.round(Number(value))]?.label ?? ""}
                    tickLine={false}
                    type="number"
                  />
                  <YAxis axisLine={false} domain={["auto", "auto"]} tick={{ fill: "#697185", fontSize: 11 }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}k`} tickLine={false} width={62} />
                  <Tooltip content={<AgentTooltip />} />
                  <Line dataKey="price" dot={false} stroke={activeCommodity.colorHex} strokeWidth={2} type="monotone" />
                  {testStart ? (
                    <ReferenceLine
                      ifOverflow="extendDomain"
                      label={{ fill: "#b6bdcf", fontSize: 11, position: "insideTopRight", value: "test" }}
                      stroke="#f6c85f"
                      strokeDasharray="5 5"
                      x={testStart.x}
                    />
                  ) : null}
                  {(["hold", "buy", "sell"] as AgentActionName[]).map((actionName) => (
                    <Scatter
                      data={chartPoints.filter((point) => point.actionName === actionName)}
                      dataKey="price"
                      key={actionName}
                      shape={<DecisionDot />}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        <div className="panel gym-side">
          <div className="panel-head">
            <div>
              <h3 style={{ fontSize: 15 }}>Bot state</h3>
              <p className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                {selectedPoint ? selectedPoint.label : "Click a decision marker in the chart"}
              </p>
            </div>
          </div>
          {selectedPoint ? (
            <BotPointState point={selectedPoint} />
          ) : (
            <div className="stat-grid" style={{ padding: 18 }}>
              <Stat label="Buy" value={`${stats.buyPct.toFixed(1)}%`} />
              <Stat label="Hold" value={`${stats.holdPct.toFixed(1)}%`} />
              <Stat label="Sell" value={`${stats.sellPct.toFixed(1)}%`} />
              <Stat label="Avg confidence" value={`${(stats.avgConfidence * 100).toFixed(1)}%`} />
              <Stat label="Avg uncertainty" value={`${(stats.avgUncertainty * 100).toFixed(1)}%`} />
              <Stat label="Net worth" value={`$${stats.latestNetWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
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
      <div className="stat-grid">
        <Stat label="Price" value={`$${point.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <Stat label="Hold prob" value={`${(point.probHold * 100).toFixed(1)}%`} />
        <Stat label="Buy prob" value={`${(point.probBuy * 100).toFixed(1)}%`} />
        <Stat label="Sell prob" value={`${(point.probSell * 100).toFixed(1)}%`} />
        <Stat label="Uncertainty" value={`${(point.uncertainty * 100).toFixed(1)}%`} />
        <Stat label="Net worth" value={`$${point.netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="Reward" value={point.reward.toFixed(4)} />
        <Stat label="Position" value={point.position === null ? "n/a" : point.position.toLocaleString()} />
      </div>
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

function DecisionDot(props: { cx?: number; cy?: number; payload?: AgentChartPoint }) {
  if (props.cx === undefined || props.cy === undefined || !props.payload) return <g />;

  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      fill={ACTION_COLOR[props.payload.actionName]}
      fillOpacity={Math.max(0.18, props.payload.confidence)}
      r={5 + props.payload.confidence * 5}
      stroke="#10131a"
      strokeWidth={1.5}
    />
  );
}

function summarizeAgentPoints(points: AgentChartPoint[]) {
  const count = Math.max(points.length, 1);
  const buy = points.filter((point) => point.actionName === "buy").length;
  const hold = points.filter((point) => point.actionName === "hold").length;
  const sell = points.filter((point) => point.actionName === "sell").length;

  return {
    buyPct: (buy / count) * 100,
    holdPct: (hold / count) * 100,
    sellPct: (sell / count) * 100,
    avgConfidence: average(points.map((point) => point.confidence)),
    avgUncertainty: average(points.map((point) => point.normalizedEntropy || 1 - point.confidence)),
    latestNetWorth: points[points.length - 1]?.netWorth ?? 0,
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function useClientMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

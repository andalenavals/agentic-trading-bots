"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
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
  AgentDatasetKind,
  AgentGymData,
  AgentModelKind,
  Commodity,
  CommoditySlug,
} from "@/lib/types";

type Granularity = "day" | "month" | "year" | "all";

type Props = {
  agentGym: AgentGymData;
  commodities: Commodity[];
};

const ACTION_COLOR: Record<AgentActionName, string> = {
  hold: "#f6c85f",
  buy: "#4caf50",
  sell: "#ef5350",
};

export function AgentGym({ agentGym, commodities }: Props) {
  const mounted = useClientMounted();
  const [model, setModel] = useState<AgentModelKind>("single_asset_ppo");
  const [dataset, setDataset] = useState<AgentDatasetKind>("full");
  const [split, setSplit] = useState(1);
  const [commodity, setCommodity] = useState<CommoditySlug>("copper_lme");
  const [granularity, setGranularity] = useState<Granularity>("month");

  const matching = useMemo(
    () =>
      agentGym.points.filter(
        (point) =>
          point.model === model &&
          point.dataset === dataset &&
          point.split === split &&
          point.commodity === commodity,
      ),
    [agentGym.points, commodity, dataset, model, split],
  );

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const availableStart = matching[0]?.date.slice(0, 10) ?? "";
  const availableEnd = matching[matching.length - 1]?.date.slice(0, 10) ?? "";

  const filtered = useMemo(() => {
    return matching.filter((point) => {
      const day = point.date.slice(0, 10);
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  }, [endDate, matching, startDate]);

  const aggregated = useMemo(() => aggregateAgentPoints(filtered, granularity), [filtered, granularity]);
  const stats = useMemo(() => summarizeAgentPoints(filtered), [filtered]);
  const activeCommodity = COMMODITY_LOOKUP[commodity];

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
          <select value={model} onChange={(event) => setModel(event.target.value as AgentModelKind)}>
            <option value="single_asset_ppo">Single asset PPO</option>
            <option value="multiple_asset_ppo">Multi asset PPO</option>
          </select>
        </Control>
        <Control label="Dataset">
          <select value={dataset} onChange={(event) => setDataset(event.target.value as AgentDatasetKind)}>
            <option value="full">Full dataset</option>
            <option value="test">Test split</option>
          </select>
        </Control>
        <Control label="Split">
          <select value={split} onChange={(event) => setSplit(Number(event.target.value))}>
            <option value={1}>Split 1</option>
            <option value={2}>Split 2</option>
            <option value={3}>Split 3</option>
          </select>
        </Control>
        <Control label="Commodity">
          <select value={commodity} onChange={(event) => setCommodity(event.target.value as CommoditySlug)}>
            {commodities.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </Control>
        <Control label="From">
          <input min={availableStart} max={availableEnd} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
        </Control>
        <Control label="To">
          <input min={availableStart} max={availableEnd} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
        </Control>
        <Control label="Granularity">
          <select value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)}>
            <option value="day">Days</option>
            <option value="month">Months</option>
            <option value="year">Years</option>
            <option value="all">All</option>
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
                  Buy, hold, and sell markers over {granularity === "all" ? "the full selected window" : `${granularity}-level`} price data
                </p>
              </div>
            </div>
            <Legend />
          </div>
          <div className="chart-box" style={{ height: 390 }}>
            {mounted ? (
              <ResponsiveContainer height="100%" width="100%">
                <ComposedChart data={aggregated}>
                  <CartesianGrid stroke="#252b3a" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tick={{ fill: "#697185", fontSize: 11 }} tickLine={false} />
                  <YAxis axisLine={false} domain={["auto", "auto"]} tick={{ fill: "#697185", fontSize: 11 }} tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(1)}k`} tickLine={false} width={62} />
                  <Tooltip content={<AgentTooltip />} />
                  <Line dataKey="price" dot={false} stroke={activeCommodity.colorHex} strokeWidth={2} type="monotone" />
                  {(["hold", "buy", "sell"] as AgentActionName[]).map((actionName) => (
                    <Scatter
                      data={aggregated.filter((point) => point.actionName === actionName)}
                      dataKey="price"
                      key={actionName}
                      shape={<DecisionDot />}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            ) : null}
          </div>
          <ActionTimeline points={aggregated} />
        </div>

        <div className="panel gym-side">
          <div className="panel-head">
            <div>
              <h3 style={{ fontSize: 15 }}>Bot state</h3>
              <p className="faint" style={{ fontSize: 11, marginTop: 3 }}>{filtered.length} decisions in view</p>
            </div>
          </div>
          <div className="stat-grid" style={{ padding: 18 }}>
            <Stat label="Buy" value={`${stats.buyPct.toFixed(1)}%`} />
            <Stat label="Hold" value={`${stats.holdPct.toFixed(1)}%`} />
            <Stat label="Sell" value={`${stats.sellPct.toFixed(1)}%`} />
            <Stat label="Avg confidence" value={`${(stats.avgConfidence * 100).toFixed(1)}%`} />
            <Stat label="Avg uncertainty" value={`${(stats.avgUncertainty * 100).toFixed(1)}%`} />
            <Stat label="Net worth" value={`$${stats.latestNetWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          </div>
          <div className="gym-note">
            <strong>Included training code</strong>
            <p>
              Python PPO trainers are now in `agents/single_asset` and `agents/multiple_asset`. This panel visualizes their saved evaluation outputs rather than retraining in the browser.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionTimeline({ points }: { points: AggregatedAgentPoint[] }) {
  return (
    <div className="action-timeline">
      {points.map((point) => (
        <div className="action-mark-wrap" key={point.key}>
          <span
            className="action-mark"
            style={{
              backgroundColor: ACTION_COLOR[point.actionName],
              opacity: Math.max(0.18, point.confidence),
            }}
            title={`${point.label}: ${point.actionName} (${(point.confidence * 100).toFixed(1)}% confidence)`}
          />
        </div>
      ))}
    </div>
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

type AggregatedAgentPoint = {
  key: string;
  label: string;
  price: number;
  probHold: number;
  probBuy: number;
  probSell: number;
  confidence: number;
  uncertainty: number;
  actionName: AgentActionName;
  netWorth: number;
  reward: number;
};

function aggregateAgentPoints(points: AgentDecisionPoint[], granularity: Granularity): AggregatedAgentPoint[] {
  const buckets = new Map<string, AgentDecisionPoint[]>();

  for (const point of points) {
    const key = bucketKey(point.date, granularity);
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const probHold = average(bucket.map((point) => point.probHold));
    const probBuy = average(bucket.map((point) => point.probBuy));
    const probSell = average(bucket.map((point) => point.probSell));
    const actionName = dominantAction({ probHold, probBuy, probSell });
    const confidence = Math.max(probHold, probBuy, probSell);

    return {
      key,
      label: labelForKey(key, granularity),
      price: average(bucket.map((point) => point.price)),
      probHold,
      probBuy,
      probSell,
      confidence,
      uncertainty: 1 - confidence,
      actionName,
      netWorth: bucket[bucket.length - 1]?.netWorth ?? 0,
      reward: bucket.reduce((sum, point) => sum + point.reward, 0),
    };
  });
}

function AgentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AggregatedAgentPoint }> }) {
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
    </div>
  );
}

function DecisionDot(props: { cx?: number; cy?: number; payload?: AggregatedAgentPoint }) {
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

function summarizeAgentPoints(points: AgentDecisionPoint[]) {
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

function bucketKey(date: string, granularity: Granularity) {
  const day = date.slice(0, 10);
  if (granularity === "all") return "all";
  if (granularity === "year") return day.slice(0, 4);
  if (granularity === "month") return day.slice(0, 7);
  return day;
}

function labelForKey(key: string, granularity: Granularity) {
  if (granularity === "all") return "All";
  if (granularity === "year") return key;
  if (granularity === "month") {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dominantAction(probs: { probHold: number; probBuy: number; probSell: number }): AgentActionName {
  if (probs.probBuy >= probs.probHold && probs.probBuy >= probs.probSell) return "buy";
  if (probs.probSell >= probs.probHold && probs.probSell >= probs.probBuy) return "sell";
  return "hold";
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

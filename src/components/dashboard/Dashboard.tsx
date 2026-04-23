"use client";

import { useMemo, useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import { EventFeed } from "@/components/dashboard/EventFeed";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import type { CommoditySlug, DashboardData, SentimentPoint } from "@/lib/types";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";

type Props = {
  data: DashboardData;
};

const MARKET_RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 9999 },
];

export function Dashboard({ data }: Props) {
  const [activeCommodity, setActiveCommodity] = useState<CommoditySlug>("copper_lme");
  const [selectedPoint, setSelectedPoint] = useState<SentimentPoint | null>(null);
  const [chartType, setChartType] = useState<ChartType>("area");
  const [range, setRange] = useState(9999);
  const [markerSize, setMarkerSize] = useState(5);
  const [markerType, setMarkerType] = useState<MarkerType>("none");
  const [alphaLevel, setAlphaLevel] = useState(0.72);
  const [logScale, setLogScale] = useState(false);
  const activePoints = data.pricesByCommodity[activeCommodity];
  const activeCommodityMeta = useMemo(
    () => data.commodities.find((commodity) => commodity.slug === activeCommodity)!,
    [activeCommodity, data.commodities],
  );

  function selectCommodity(slug: CommoditySlug) {
    setActiveCommodity(slug);
    setSelectedPoint(null);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>Commodity Signal Intelligence</h1>
      </header>

      <div className="layer-switch">
        <button className="active" type="button">
          News
        </button>
        <a href="docs/">Docs</a>
      </div>

      <section className="market-news-layout">
        <CommodityCards
          activeCommodity={activeCommodity}
          commodities={data.commodities}
          onSelect={selectCommodity}
        />
        <VisualizationControls
          alphaLevel={alphaLevel}
          chartType={chartType}
          markerSize={markerSize}
          markerType={markerType}
          logScale={logScale}
          range={range}
          ranges={MARKET_RANGES}
          onAlphaLevelChange={setAlphaLevel}
          onChartTypeChange={setChartType}
          onLogScaleChange={setLogScale}
          onMarkerSizeChange={setMarkerSize}
          onMarkerTypeChange={setMarkerType}
          onRangeChange={setRange}
        />
        <details className="panel market-panel news-chart-panel">
          <summary>News Chart</summary>
          <div className="news-chart-body">
            <PriceChart
              alphaLevel={alphaLevel}
              chartType={chartType}
              commodity={activeCommodityMeta}
              embedded
              logScale={logScale}
              markerSize={markerSize}
              markerType={markerType}
              onSelectPoint={setSelectedPoint}
              points={activePoints}
              range={range}
            />
            <EventFeed commodity={activeCommodityMeta} embedded selectedPoint={selectedPoint} />
          </div>
        </details>
        <details className="panel market-panel news-chart-panel decision-chart-panel">
          <summary>Decision Chart</summary>
          <div className="news-chart-body">
            <AgentGym
              agentGym={data.agentGym}
              commodities={data.commodities}
            />
          </div>
        </details>
      </section>
    </main>
  );
}

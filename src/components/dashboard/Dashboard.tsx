"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import { EventFeed } from "@/components/dashboard/EventFeed";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { PredictionChart } from "@/components/dashboard/PredictionChart";
import { SentimentChart } from "@/components/dashboard/SentimentChart";
import { TimeSeriesRangeBar } from "@/components/dashboard/TimeSeriesRangeBar";
import { useAnimatedXRange } from "@/components/dashboard/useAnimatedRange";
import { VisualizationControls } from "@/components/dashboard/VisualizationControls";
import { fullXRange, normalizeXRange, remapXRange } from "@/lib/analytics/chart-zoom";
import type { CommoditySlug, DashboardData, SentimentPoint } from "@/lib/types";
import type { XRange } from "@/lib/analytics/chart-zoom";
import type { ChartType, MarkerType } from "@/components/dashboard/VisualizationControls";

type Props = {
  data: DashboardData;
};

type PanelKey = "news" | "sentiment" | "decision" | "predictions";

const MARKET_RANGES = [
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 99999 },
];

const DEFAULT_LINE_WIDTH = 2;

export function Dashboard({ data }: Props) {
  const [activeCommodity, setActiveCommodity] = useState<CommoditySlug>("copper_lme");
  const [selectedPoint, setSelectedPoint] = useState<SentimentPoint | null>(null);
  const [chartType, setChartType] = useState<ChartType>("area");
  const [range, setRange] = useState(99999);
  const [markerSize, setMarkerSize] = useState(5);
  const [markerType, setMarkerType] = useState<MarkerType>("none");
  const [lineWidth, setLineWidth] = useState(DEFAULT_LINE_WIDTH);
  const [lineWidthAuto, setLineWidthAuto] = useState(true);
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>({
    decision: false,
    news: false,
    predictions: false,
    sentiment: false,
  });
  const [alphaLevel, setAlphaLevel] = useState(0.72);
  const [logScale, setLogScale] = useState(false);
  const previousRange = useRef(range);
  const {
    range: sharedViewportRange,
    setAnimated: setAnimatedViewport,
    setImmediate: setImmediateViewport,
  } = useAnimatedXRange();
  const activePoints = data.pricesByCommodity[activeCommodity];
  const activeCommodityMeta = useMemo(
    () => data.commodities.find((commodity) => commodity.slug === activeCommodity)!,
    [activeCommodity, data.commodities],
  );
  const filteredPoints = useMemo(
    () => (range >= 9999 ? activePoints : activePoints.slice(-range)),
    [activePoints, range],
  );
  const viewportLabels = useMemo(
    () =>
      filteredPoints.map((point) =>
        new Date(point.date).toLocaleDateString("en-US", {
          day: range < 365 ? "numeric" : undefined,
          month: "short",
          year: range >= 365 ? "2-digit" : undefined,
        }),
      ),
    [filteredPoints, range],
  );
  const sharedXDomain = sharedViewportRange ?? fullXRange(filteredPoints.length);
  const sharedVisibleRange = normalizeXRange(sharedXDomain, filteredPoints.length);

  useEffect(() => {
    if (previousRange.current === range) return;
    previousRange.current = range;
    setImmediateViewport(null);
  }, [range, setImmediateViewport]);

  function selectCommodity(slug: CommoditySlug) {
    setActiveCommodity(slug);
    setSelectedPoint(null);
  }

  function handleMarkerSizeChange(nextSize: number) {
    setMarkerSize(nextSize);
    if (lineWidthAuto && markerType !== "none") {
      setLineWidth(defaultLineWidth(markerType, nextSize));
    }
  }

  function handleMarkerTypeChange(nextType: MarkerType) {
    const shouldResetLineWidth = lineWidthAuto || (markerType === "none" && nextType !== "none");
    setMarkerType(nextType);
    if (shouldResetLineWidth) {
      setLineWidth(defaultLineWidth(nextType, markerSize));
      setLineWidthAuto(true);
    }
  }

  function handleLineWidthChange(nextWidth: number) {
    setLineWidth(nextWidth);
    setLineWidthAuto(false);
  }

  function handlePanelToggle(panel: PanelKey, open: boolean) {
    setOpenPanels((current) => (current[panel] === open ? current : { ...current, [panel]: open }));
  }

  function handleViewportChange(nextRange: XRange, animated = false) {
    if (animated) {
      setAnimatedViewport(nextRange, sharedVisibleRange);
    } else {
      setImmediateViewport(nextRange);
    }
  }

  function handleViewportChangeFromChart(nextRange: XRange, chartLength: number) {
    handleViewportChange(remapXRange(nextRange, chartLength, filteredPoints.length));
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
          lineWidth={lineWidth}
          markerSize={markerSize}
          markerType={markerType}
          logScale={logScale}
          range={range}
          ranges={MARKET_RANGES}
          viewportControls={(
            <TimeSeriesRangeBar
              labels={viewportLabels}
              length={filteredPoints.length}
              onChange={handleViewportChange}
              range={sharedVisibleRange}
            />
          )}
          onAlphaLevelChange={setAlphaLevel}
          onChartTypeChange={setChartType}
          onLineWidthChange={handleLineWidthChange}
          onLogScaleChange={setLogScale}
          onMarkerSizeChange={handleMarkerSizeChange}
          onMarkerTypeChange={handleMarkerTypeChange}
          onRangeChange={setRange}
        />
        <details className="panel market-panel news-chart-panel" open={openPanels.news} onToggle={(event) => handlePanelToggle("news", event.currentTarget.open)}>
          <summary>News Chart</summary>
          {openPanels.news ? (
            <div className="news-chart-body">
              <PriceChart
                alphaLevel={alphaLevel}
                chartType={chartType}
                commodity={activeCommodityMeta}
                embedded
                lineWidth={lineWidth}
                logScale={logScale}
                markerSize={markerSize}
                markerType={markerType}
                onSelectPoint={setSelectedPoint}
                onXRangeChange={(nextRange) => handleViewportChangeFromChart(nextRange, filteredPoints.length)}
                points={activePoints}
                range={range}
                xRange={sharedXDomain}
              />
              <EventFeed commodity={activeCommodityMeta} embedded selectedPoint={selectedPoint} />
            </div>
          ) : null}
        </details>
        <details className="panel market-panel news-chart-panel decision-chart-panel" open={openPanels.sentiment} onToggle={(event) => handlePanelToggle("sentiment", event.currentTarget.open)}>
          <summary>Sentiment Chart</summary>
          {openPanels.sentiment ? (
            <div className="news-chart-body">
              <SentimentChart
                alphaLevel={alphaLevel}
                chartType={chartType}
                commodity={activeCommodityMeta}
                lineWidth={lineWidth}
                key={activeCommodity}
                markerSize={markerSize}
                markerType={markerType}
                onXRangeChange={(nextRange) => handleViewportChangeFromChart(nextRange, filteredPoints.length)}
                points={activePoints}
                range={range}
                xRange={sharedXDomain}
              />
            </div>
          ) : null}
        </details>
        <details className="panel market-panel news-chart-panel decision-chart-panel" open={openPanels.decision} onToggle={(event) => handlePanelToggle("decision", event.currentTarget.open)}>
          <summary>Decision Chart</summary>
          {openPanels.decision ? (
            <div className="news-chart-body">
              <AgentGym
                alphaLevel={alphaLevel}
                activeCommodity={activeCommodity}
                agentGym={data.agentGym}
                chartType={chartType}
                commodities={data.commodities}
                lineWidth={lineWidth}
                logScale={logScale}
                markerSize={markerSize}
                markerType={markerType}
                onSharedXRangeChange={handleViewportChangeFromChart}
                range={range}
                sharedXRange={sharedXDomain}
                sharedXRangeLength={filteredPoints.length}
              />
            </div>
          ) : null}
        </details>
        <details className="panel market-panel news-chart-panel decision-chart-panel" open={openPanels.predictions} onToggle={(event) => handlePanelToggle("predictions", event.currentTarget.open)}>
          <summary>Predictions Chart</summary>
          {openPanels.predictions ? (
            <div className="news-chart-body">
              <PredictionChart
                activeCommodity={activeCommodity}
                alphaLevel={alphaLevel}
                chartType={chartType}
                lineWidth={lineWidth}
                logScale={logScale}
                markerSize={markerSize}
                markerType={markerType}
                onSharedXRangeChange={handleViewportChangeFromChart}
                predictionChart={data.predictionChart}
                range={range}
                sharedXRange={sharedXDomain}
                sharedXRangeLength={filteredPoints.length}
              />
            </div>
          ) : null}
        </details>
      </section>
    </main>
  );
}

function defaultLineWidth(markerType: MarkerType, markerSize: number) {
  return markerType === "none" ? DEFAULT_LINE_WIDTH : Math.round(markerSize * 25) / 100;
}

"use client";

import { useMemo, useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import { EventFeed } from "@/components/dashboard/EventFeed";
import { OverlayChart } from "@/components/dashboard/OverlayChart";
import { PriceChart } from "@/components/dashboard/PriceChart";
import type { CommoditySlug, DashboardData, SentimentPoint } from "@/lib/types";

type Props = {
  data: DashboardData;
};

export function Dashboard({ data }: Props) {
  const [layer, setLayer] = useState<"market" | "gym">("market");
  const [activeCommodity, setActiveCommodity] = useState<CommoditySlug>("copper_lme");
  const [selectedPoint, setSelectedPoint] = useState<SentimentPoint | null>(null);
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
        <div>
          <p className="eyebrow">Commodity Signal Intelligence</p>
          <h1>Agentic trading bots</h1>
          <p className="subtitle">
            Local-first dashboard combining LME price history, curated market news, generated sentiment features,
            and reinforcement-learning outputs from trained commodity trading bots.
          </p>
        </div>
        <div className="meta-strip">
          <span className="muted">Data rows</span>
          <strong>{Object.values(data.pricesByCommodity).reduce((sum, points) => sum + points.length, 0)}</strong>
          <span className="muted">Events</span>
          <strong>{data.news.length}</strong>
        </div>
      </header>

      <div className="layer-switch">
        <button className={layer === "market" ? "active" : ""} onClick={() => setLayer("market")} type="button">
          Demo: market + news
        </button>
        <button className={layer === "gym" ? "active" : ""} onClick={() => setLayer("gym")} type="button">
          Demo: trading bots gym
        </button>
        <a href="docs/">Sphinx docs</a>
      </div>

      {layer === "market" ? (
        <>
          <CommodityCards
            activeCommodity={activeCommodity}
            commodities={data.commodities}
            pricesByCommodity={data.pricesByCommodity}
            onSelect={selectCommodity}
          />

          <section className="grid dashboard-grid" style={{ marginTop: 18 }}>
            <div className="grid">
              <PriceChart
                commodity={activeCommodityMeta}
                onSelectPoint={setSelectedPoint}
                points={activePoints}
                selectedPoint={selectedPoint}
              />
              <OverlayChart commodities={data.commodities} pricesByCommodity={data.pricesByCommodity} />
            </div>
            <EventFeed commodity={activeCommodityMeta} selectedPoint={selectedPoint} />
          </section>
        </>
      ) : (
        <AgentGym
          agentGym={data.agentGym}
          commodities={data.commodities}
        />
      )}
    </main>
  );
}

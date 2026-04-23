"use client";

import { useMemo, useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import { EventFeed } from "@/components/dashboard/EventFeed";
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
        <h1>Commodity Signal Intelligence</h1>
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
            onSelect={selectCommodity}
          />

          <section className="grid market-stack" style={{ marginTop: 18 }}>
            <PriceChart
              commodity={activeCommodityMeta}
              onSelectPoint={setSelectedPoint}
              points={activePoints}
            />
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

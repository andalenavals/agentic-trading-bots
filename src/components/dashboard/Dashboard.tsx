"use client";

import { useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import type { CommoditySlug, DashboardData } from "@/lib/types";

type Props = {
  data: DashboardData;
};

export function Dashboard({ data }: Props) {
  const [layer, setLayer] = useState<"market" | "gym">("market");
  const [activeCommodity, setActiveCommodity] = useState<CommoditySlug>("copper_lme");

  function selectCommodity(slug: CommoditySlug) {
    setActiveCommodity(slug);
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

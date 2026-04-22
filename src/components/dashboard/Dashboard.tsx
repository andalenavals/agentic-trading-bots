"use client";

import { useMemo, useState } from "react";
import { AgentGym } from "@/components/dashboard/AgentGym";
import { CommodityCards } from "@/components/dashboard/CommodityCards";
import { EventFeed } from "@/components/dashboard/EventFeed";
import { OverlayChart } from "@/components/dashboard/OverlayChart";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { filterNews } from "@/lib/analytics/news";
import type { CommoditySlug, DashboardData } from "@/lib/types";

type Props = {
  data: DashboardData;
};

export function Dashboard({ data }: Props) {
  const [layer, setLayer] = useState<"market" | "gym">("market");
  const [activeCommodity, setActiveCommodity] = useState<CommoditySlug>("copper_lme");
  const [eventFilter, setEventFilter] = useState<CommoditySlug | "all">("all");
  const activePoints = data.pricesByCommodity[activeCommodity];
  const activeNews = useMemo(() => filterNews(data.news, eventFilter, 24), [data.news, eventFilter]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Commodity Signal Intelligence</p>
          <h1>CreareCorp decision support</h1>
          <p className="subtitle">
            Local-first dashboard combining LME price history, curated market news, FinBERT sentiment,
            and reinforcement-learning evaluation outputs from CreareCorpAndres.
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
          Market + news layer
        </button>
        <button className={layer === "gym" ? "active" : ""} onClick={() => setLayer("gym")} type="button">
          PPO training gym
        </button>
      </div>

      {layer === "market" ? (
        <>
          <CommodityCards
            activeCommodity={activeCommodity}
            commodities={data.commodities}
            pricesByCommodity={data.pricesByCommodity}
            onSelect={setActiveCommodity}
          />

          <section className="grid dashboard-grid" style={{ marginTop: 18 }}>
            <div className="grid">
              <PriceChart
                commodity={data.commodities.find((commodity) => commodity.slug === activeCommodity)!}
                points={activePoints}
              />
              <OverlayChart commodities={data.commodities} pricesByCommodity={data.pricesByCommodity} />
            </div>
            <EventFeed
              commodities={data.commodities}
              news={activeNews}
              filter={eventFilter}
              onFilterChange={setEventFilter}
            />
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

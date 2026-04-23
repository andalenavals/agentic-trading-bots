"use client";

import type { Commodity, CommoditySlug } from "@/lib/types";

type Props = {
  activeCommodity: CommoditySlug;
  commodities: Commodity[];
  onSelect: (slug: CommoditySlug) => void;
};

export function CommodityCards({ activeCommodity, commodities, onSelect }: Props) {
  const commodity = commodities.find((item) => item.slug === activeCommodity) ?? commodities[0];

  return (
    <section className="panel commodity-picker">
      <label>
        <span>Commodity</span>
        <select value={commodity.slug} onChange={(event) => onSelect(event.target.value as CommoditySlug)}>
          {commodities.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

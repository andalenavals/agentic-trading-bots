import type { Commodity, CommoditySlug } from "@/lib/types";

export const COMMODITIES: Commodity[] = [
  {
    slug: "copper_lme",
    name: "Copper",
    symbol: "Cu",
    colorHex: "#e87040",
    description: "Electrical infrastructure, construction, and macro demand proxy.",
  },
  {
    slug: "nickel_lme",
    name: "Nickel",
    symbol: "Ni",
    colorHex: "#4caf50",
    description: "Battery materials, stainless steel, and supply disruption sensitivity.",
  },
  {
    slug: "aluminium_lme",
    name: "Aluminium",
    symbol: "Al",
    colorHex: "#4d8dff",
    description: "Lightweight manufacturing, energy costs, and inventory pressure.",
  },
];

export const COMMODITY_LOOKUP = Object.fromEntries(
  COMMODITIES.map((commodity) => [commodity.slug, commodity]),
) as Record<CommoditySlug, Commodity>;

export function normalizeCommodity(value: string): CommoditySlug | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "copper" || normalized === "copper_lme") return "copper_lme";
  if (normalized === "nickel" || normalized === "nickel_lme") return "nickel_lme";
  if (normalized === "aluminium" || normalized === "aluminum" || normalized === "aluminium_lme") {
    return "aluminium_lme";
  }
  return null;
}


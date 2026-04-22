import { cache } from "react";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCommodity } from "@/lib/analytics/commodities";
import { parseCsv, toNumber } from "@/lib/data/csv";
import type {
  AgentActionName,
  AgentDatasetKind,
  AgentDecisionPoint,
  AgentGymData,
  AgentModelKind,
  CommoditySlug,
} from "@/lib/types";

const AGENT_ROOT = path.join(process.cwd(), "data", "agent_outputs");
const ACTION_NAMES: Record<0 | 1 | 2, AgentActionName> = {
  0: "hold",
  1: "buy",
  2: "sell",
};

const AGENT_SOURCES: AgentGymData["sources"] = [
  { model: "single_asset_ppo", dataset: "test", split: 1, path: "single_asset_ppo/evaluation_split_1.csv" },
  { model: "single_asset_ppo", dataset: "test", split: 2, path: "single_asset_ppo/evaluation_split_2.csv" },
  { model: "single_asset_ppo", dataset: "test", split: 3, path: "single_asset_ppo/evaluation_split_3.csv" },
  { model: "single_asset_ppo", dataset: "full", split: 1, path: "single_asset_ppo/full_dataset_predictions_split_1.csv" },
  { model: "single_asset_ppo", dataset: "full", split: 2, path: "single_asset_ppo/full_dataset_predictions_split_2.csv" },
  { model: "single_asset_ppo", dataset: "full", split: 3, path: "single_asset_ppo/full_dataset_predictions_split_3.csv" },
  { model: "multiple_asset_ppo", dataset: "test", split: 1, path: "multiple_asset_ppo/evaluation_split_1_multi_asset_infinite_capital.csv" },
  { model: "multiple_asset_ppo", dataset: "test", split: 2, path: "multiple_asset_ppo/evaluation_split_2_multi_asset_infinite_capital.csv" },
  { model: "multiple_asset_ppo", dataset: "test", split: 3, path: "multiple_asset_ppo/evaluation_split_3_multi_asset_infinite_capital.csv" },
  { model: "multiple_asset_ppo", dataset: "full", split: 1, path: "multiple_asset_ppo/evaluation_full_dataset_split_1_multi_asset_infinite_capital.csv" },
  { model: "multiple_asset_ppo", dataset: "full", split: 2, path: "multiple_asset_ppo/evaluation_full_dataset_split_2_multi_asset_infinite_capital.csv" },
  { model: "multiple_asset_ppo", dataset: "full", split: 3, path: "multiple_asset_ppo/evaluation_full_dataset_split_3_multi_asset_infinite_capital.csv" },
];

export const loadAgentGymData = cache(async (): Promise<AgentGymData> => {
  const loaded = await Promise.all(
    AGENT_SOURCES.map(async (source) => {
      const fullPath = path.join(AGENT_ROOT, source.path);
      if (!(await exists(fullPath))) return { source, points: [] };

      const text = await readFile(fullPath, "utf8");
      const rows = parseCsv(text);
      const points = source.model === "single_asset_ppo"
        ? rows.flatMap((row) => parseSingleAssetRow(row, source.model, source.dataset, source.split))
        : rows.flatMap((row) => parseMultipleAssetRow(row, source.model, source.dataset, source.split));

      return { source, points };
    }),
  );

  return {
    points: loaded.flatMap((item) => item.points).sort((a, b) => a.date.localeCompare(b.date)),
    sources: loaded.filter((item) => item.points.length > 0).map((item) => item.source),
  };
});

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseSingleAssetRow(
  row: Record<string, string>,
  model: AgentModelKind,
  dataset: AgentDatasetKind,
  split: number,
): AgentDecisionPoint[] {
  const commodity = normalizeCommodity(row.commodity);
  if (!commodity) return [];
  const action = toAction(row.action);
  const greedyAction = toAction(row.greedy_action);
  const probHold = toNumber(row.prob_hold);
  const probBuy = toNumber(row.prob_buy);
  const probSell = toNumber(row.prob_sell);
  const normalizedEntropy = normalizeEntropy(toNumber(row.entropy));

  return [
    {
      model,
      dataset,
      split,
      date: row.date,
      commodity,
      price: toNumber(row.raw_price || row.price),
      action,
      actionName: ACTION_NAMES[action],
      greedyAction,
      greedyActionName: ACTION_NAMES[greedyAction],
      probHold,
      probBuy,
      probSell,
      entropy: toNumber(row.entropy),
      normalizedEntropy,
      confidence: Math.max(probHold, probBuy, probSell),
      netWorth: toNumber(row.net_worth),
      reward: toNumber(row.reward),
      position: row.position ? toNumber(row.position) : null,
    },
  ];
}

function parseMultipleAssetRow(
  row: Record<string, string>,
  model: AgentModelKind,
  dataset: AgentDatasetKind,
  split: number,
): AgentDecisionPoint[] {
  const commodities: CommoditySlug[] = ["aluminium_lme", "copper_lme", "nickel_lme"];

  return commodities.map((commodity) => {
    const action = toAction(row[`action_${commodity}`]);
    const greedyAction = toAction(row[`greedy_action_${commodity}`]);
    const probHold = toNumber(row[`prob_hold_${commodity}`]);
    const probBuy = toNumber(row[`prob_buy_${commodity}`]);
    const probSell = toNumber(row[`prob_sell_${commodity}`]);
    const normalizedEntropy = toNumber(row[`normalized_entropy_${commodity}`]);

    return {
      model,
      dataset,
      split,
      date: row.date,
      commodity,
      price: toNumber(row[`price_${commodity}`]),
      action,
      actionName: ACTION_NAMES[action],
      greedyAction,
      greedyActionName: ACTION_NAMES[greedyAction],
      probHold,
      probBuy,
      probSell,
      entropy: toNumber(row[`entropy_${commodity}`]),
      normalizedEntropy,
      confidence: Math.max(probHold, probBuy, probSell),
      netWorth: toNumber(row.net_worth),
      reward: toNumber(row.reward),
      position: toNumber(row[`position_${commodity}`]),
    };
  });
}

function toAction(value: string): 0 | 1 | 2 {
  const parsed = Number.parseInt(value, 10);
  if (parsed === 1 || parsed === 2) return parsed;
  return 0;
}

function normalizeEntropy(entropy: number) {
  if (entropy <= 0) return 0;
  return Math.min(1, entropy / Math.log(3));
}

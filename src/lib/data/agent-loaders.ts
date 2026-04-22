import { cache } from "react";
import { access, readFile, readdir } from "node:fs/promises";
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

export const loadAgentGymData = cache(async (): Promise<AgentGymData> => {
  const sources = await discoverAgentSources();
  const loaded = await Promise.all(
    sources.map(async (source) => {
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

async function discoverAgentSources(): Promise<AgentGymData["sources"]> {
  const [singleAssetFiles, multipleAssetFiles] = await Promise.all([
    safeReadDir(path.join(AGENT_ROOT, "single_asset_ppo")),
    safeReadDir(path.join(AGENT_ROOT, "multiple_asset_ppo")),
  ]);

  return [
    ...singleAssetFiles.flatMap((file) => singleAssetSource(file)),
    ...multipleAssetFiles.flatMap((file) => multipleAssetSource(file)),
  ].sort((a, b) =>
    `${a.model}-${a.dataset}-${a.split}-${a.path}`.localeCompare(`${b.model}-${b.dataset}-${b.split}-${b.path}`),
  );
}

async function safeReadDir(directory: string) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function singleAssetSource(file: string): AgentGymData["sources"] {
  const test = file.match(/^evaluation_split_(\d+)\.csv$/);
  if (test) {
    return [{ model: "single_asset_ppo", dataset: "test", split: Number(test[1]), path: `single_asset_ppo/${file}` }];
  }

  const full = file.match(/^full_dataset_predictions_split_(\d+)\.csv$/);
  if (full) {
    return [{ model: "single_asset_ppo", dataset: "full", split: Number(full[1]), path: `single_asset_ppo/${file}` }];
  }

  return [];
}

function multipleAssetSource(file: string): AgentGymData["sources"] {
  const test = file.match(/^evaluation_split_(\d+)_multi_asset_.+\.csv$/);
  if (test) {
    return [{ model: "multiple_asset_ppo", dataset: "test", split: Number(test[1]), path: `multiple_asset_ppo/${file}` }];
  }

  const full = file.match(/^evaluation_full_dataset_split_(\d+)_multi_asset_.+\.csv$/);
  if (full) {
    return [{ model: "multiple_asset_ppo", dataset: "full", split: Number(full[1]), path: `multiple_asset_ppo/${file}` }];
  }

  return [];
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

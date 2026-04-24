import { cache } from "react";
import { access, readFile, readdir } from "node:fs/promises";
import { normalizeCommodity } from "@/lib/analytics/commodities";
import { parseCsv, toNumber } from "@/lib/data/csv";
import { predictionOutputPath } from "@/lib/data/paths";
import type { PredictionChartData, PredictionEvaluationMode, PredictionPoint } from "@/lib/types";

const PREDICTION_MODELS = [
  "ar1_baseline",
  "arimax_price_only",
  "arimax_sentiment",
  "gaussian_process_price_only",
  "gaussian_process_sentiment",
  "lstm_price_only",
  "lstm_sentiment",
  "lightgbm_direct_price_only",
  "lightgbm_direct_sentiment",
  "ridge_arx_price_only",
  "ridge_arx_sentiment",
  "lightgbm_price_only",
  "lightgbm_sentiment",
] as const;

type DiscoveredPredictionSource = Omit<
  PredictionChartData["sources"][number],
  "directionAccuracy" | "directionCorrectCount" | "directionEvaluatedCount"
>;

export const loadPredictionChartData = cache(async (): Promise<PredictionChartData> => {
  const sources = await discoverPredictionSources();
  const loaded = await Promise.all(
    sources.map(async (source) => {
      const fullPath = predictionOutputPath(source.path);
      if (!(await exists(fullPath))) {
        return {
          points: [] as PredictionPoint[],
          source: {
            ...source,
            directionAccuracy: null,
            directionCorrectCount: 0,
            directionEvaluatedCount: 0,
          },
        };
      }

      const text = await readFile(fullPath, "utf8");
      const rows = parseCsv(text);
      const points = rows.flatMap((row) => parsePredictionRow(row, source.model, source.evaluationMode, source.split));
      return { points, source: { ...source, ...summarizeDirectionAccuracy(rows) } };
    }),
  );

  return {
    points: loaded.flatMap((item) => item.points).sort((a, b) => a.date.localeCompare(b.date)),
    sources: loaded.filter((item) => item.points.length > 0).map((item) => item.source),
  };
});

async function discoverPredictionSources(): Promise<DiscoveredPredictionSource[]> {
  const modelDirs = await safeReadDir(predictionOutputPath());
  const discovered = await Promise.all(
    modelDirs.map(async (modelDir) => {
      if (!isPredictionModel(modelDir)) return [];
      const files = await safeReadDir(predictionOutputPath(modelDir));
      return files.flatMap((file) => predictionSource(modelDir, file));
    }),
  );

  return discovered.flat().sort((a, b) => `${a.model}-${a.split}-${a.path}`.localeCompare(`${b.model}-${b.split}-${b.path}`));
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

function predictionSource(
  model: typeof PREDICTION_MODELS[number],
  file: string,
): DiscoveredPredictionSource[] {
  const recursiveMatch = file.match(/^full_dataset_predictions_([a-z_]+)_split_(\d+)_(recursive_path)\.csv$/);
  if (recursiveMatch) {
    return [{
      model,
      evaluationMode: "recursive_path",
      split: Number(recursiveMatch[2]),
      commodity: normalizeCommodity(recursiveMatch[1]) ?? undefined,
      path: `${model}/${file}`,
    }];
  }

  const observedMatch = file.match(/^full_dataset_predictions_([a-z_]+)_split_(\d+)\.csv$/);
  if (!observedMatch) return [];
  const evaluationMode: PredictionEvaluationMode =
    isDirectMultiHorizonModel(model)
      ? "direct_multi_horizon"
      : "observed_history";

  return [{
    model,
    evaluationMode,
    split: Number(observedMatch[2]),
    commodity: normalizeCommodity(observedMatch[1]) ?? undefined,
    path: `${model}/${file}`,
  }];
}

function parsePredictionRow(
  row: Record<string, string>,
  model: typeof PREDICTION_MODELS[number],
  evaluationMode: PredictionEvaluationMode,
  split: number,
): PredictionPoint[] {
  if (row.phase !== "test" || row.predicted_price === "") return [];

  const commodity = normalizeCommodity(row.commodity);
  if (!commodity) return [];

  return [{
    model,
    evaluationMode,
    split,
    datasetIndex: toNumber(row.dataset_index),
    date: row.date,
    commodity,
    predictedPrice: row.predicted_price ? toNumber(row.predicted_price) : null,
    error: row.error ? toNumber(row.error) : null,
    absoluteError: row.absolute_error ? toNumber(row.absolute_error) : null,
    alpha: toNumber(row.alpha),
    beta: toNumber(row.beta),
  }];
}

function summarizeDirectionAccuracy(rows: Array<Record<string, string>>) {
  let directionCorrectCount = 0;
  let directionEvaluatedCount = 0;

  for (const row of rows) {
    if (row.phase !== "test" || row.predicted_price === "") continue;
    if (row.direction_correct === "") continue;
    directionEvaluatedCount += 1;
    if (toNumber(row.direction_correct) >= 0.5) {
      directionCorrectCount += 1;
    }
  }

  return {
    directionAccuracy: directionEvaluatedCount > 0 ? directionCorrectCount / directionEvaluatedCount : null,
    directionCorrectCount,
    directionEvaluatedCount,
  };
}

function isPredictionModel(value: string): value is typeof PREDICTION_MODELS[number] {
  return (PREDICTION_MODELS as readonly string[]).includes(value);
}

function isDirectMultiHorizonModel(value: typeof PREDICTION_MODELS[number]) {
  return value === "lightgbm_direct_price_only" || value === "lightgbm_direct_sentiment";
}

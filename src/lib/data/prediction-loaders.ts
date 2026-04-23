import { cache } from "react";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { normalizeCommodity } from "@/lib/analytics/commodities";
import { parseCsv, toNumber } from "@/lib/data/csv";
import type { PredictionChartData, PredictionPoint } from "@/lib/types";

const PREDICTION_ROOT = path.join(process.cwd(), "data", "prediction_outputs");

export const loadPredictionChartData = cache(async (): Promise<PredictionChartData> => {
  const sources = await discoverPredictionSources();
  const loaded = await Promise.all(
    sources.map(async (source) => {
      const fullPath = path.join(PREDICTION_ROOT, source.path);
      if (!(await exists(fullPath))) return { points: [] as PredictionPoint[], source };

      const text = await readFile(fullPath, "utf8");
      const rows = parseCsv(text);
      const points = rows.flatMap((row) => parsePredictionRow(row, source.model, source.split));
      return { points, source };
    }),
  );

  return {
    points: loaded.flatMap((item) => item.points).sort((a, b) => a.date.localeCompare(b.date)),
    sources: loaded.filter((item) => item.points.length > 0).map((item) => item.source),
  };
});

async function discoverPredictionSources(): Promise<PredictionChartData["sources"]> {
  const files = await safeReadDir(path.join(PREDICTION_ROOT, "ar1_baseline"));
  return files.flatMap((file) => predictionSource(file));
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

function predictionSource(file: string): PredictionChartData["sources"] {
  const match = file.match(/^full_dataset_predictions_([a-z_]+)_split_(\d+)\.csv$/);
  if (!match) return [];

  return [{
    model: "ar1_baseline",
    split: Number(match[2]),
    commodity: normalizeCommodity(match[1]) ?? undefined,
    path: `ar1_baseline/${file}`,
  }];
}

function parsePredictionRow(
  row: Record<string, string>,
  model: "ar1_baseline",
  split: number,
): PredictionPoint[] {
  const commodity = normalizeCommodity(row.commodity);
  if (!commodity) return [];

  return [{
    model,
    split,
    datasetIndex: toNumber(row.dataset_index),
    phase: row.phase === "test" ? "test" : "train",
    date: row.date,
    commodity,
    price: toNumber(row.price),
    predictedPrice: row.predicted_price ? toNumber(row.predicted_price) : null,
    error: row.error ? toNumber(row.error) : null,
    absoluteError: row.absolute_error ? toNumber(row.absolute_error) : null,
    alpha: toNumber(row.alpha),
    beta: toNumber(row.beta),
  }];
}

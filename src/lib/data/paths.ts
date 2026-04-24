import path from "node:path";

export const DATA_ROOT = path.join(process.cwd(), "data");
export const AGENT_OUTPUT_ROOT = path.join(DATA_ROOT, "agent_outputs");
export const PREDICTION_OUTPUT_ROOT = path.join(DATA_ROOT, "prediction_outputs");

export function dataPath(...segments: string[]) {
  return path.join(DATA_ROOT, ...segments);
}

export function agentOutputPath(...segments: string[]) {
  return path.join(AGENT_OUTPUT_ROOT, ...segments);
}

export function predictionOutputPath(...segments: string[]) {
  return path.join(PREDICTION_OUTPUT_ROOT, ...segments);
}

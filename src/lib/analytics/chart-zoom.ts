export type XRange = {
  end: number;
  start: number;
};

export type YRange = {
  max: number;
  min: number;
};

export function fullXRange(length: number): XRange {
  return { end: Math.max(0, length - 1), start: 0 };
}

export function fullYRange(values: Array<number | null | undefined>): YRange {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!finite.length) return { max: 1, min: 0 };

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.05);
    return { max: max + padding, min: min - padding };
  }

  const padding = (max - min) * 0.04;
  return { max: max + padding, min: min - padding };
}

export function normalizeXRange(range: XRange, length: number): XRange {
  const max = Math.max(0, length - 1);
  const start = clamp(Math.round(range.start), 0, max);
  const end = clamp(Math.round(range.end), start, max);
  return { end, start };
}

export function normalizeXDomain(range: XRange, length: number): XRange {
  const max = Math.max(0, length - 1);
  const start = clamp(Math.min(range.start, range.end), 0, max);
  const end = clamp(Math.max(range.start, range.end), start, max);
  return { end, start };
}

export function normalizeYRange(range: YRange, full: YRange): YRange {
  const min = clamp(Math.min(range.min, range.max), full.min, full.max);
  const max = clamp(Math.max(range.min, range.max), min, full.max);
  return { max, min };
}

export function zoomXRangeFromCenter(current: XRange, length: number, direction: "in" | "out"): XRange {
  if (length <= 2) return fullXRange(length);

  const normalized = normalizeXRange(current, length);
  const currentSize = normalized.end - normalized.start + 1;
  const nextSize = clamp(
    Math.round(currentSize * (direction === "in" ? 0.76 : 1.32)),
    1,
    length,
  );
  const center = (normalized.start + normalized.end) / 2;
  let start = Math.round(center - (nextSize - 1) / 2);
  let end = start + nextSize - 1;

  if (start < 0) {
    end -= start;
    start = 0;
  }

  if (end > length - 1) {
    start -= end - (length - 1);
    end = length - 1;
  }

  return normalizeXRange({ end, start }, length);
}

export function zoomYRangeFromCenter(current: YRange, full: YRange, direction: "in" | "out"): YRange {
  const normalized = normalizeYRange(current, full);
  const fullSpan = Math.max(0.000001, full.max - full.min);
  const currentSpan = Math.max(0.000001, normalized.max - normalized.min);
  const nextSpan = clamp(currentSpan * (direction === "in" ? 0.76 : 1.32), fullSpan * 0.02, fullSpan);
  const center = (normalized.min + normalized.max) / 2;
  let min = center - nextSpan / 2;
  let max = center + nextSpan / 2;

  if (min < full.min) {
    max += full.min - min;
    min = full.min;
  }

  if (max > full.max) {
    min -= max - full.max;
    max = full.max;
  }

  return normalizeYRange({ max, min }, full);
}

export function xAxisTicks(range: XRange, maxTicks = 8): number[] {
  const width = Math.max(0, range.end - range.start);
  if (width === 0) return [range.start];

  const step = Math.max(1, Math.ceil(width / maxTicks));
  const ticks: number[] = [];
  for (let tick = range.start; tick <= range.end; tick += step) {
    ticks.push(tick);
  }

  if (ticks[ticks.length - 1] !== range.end) {
    ticks.push(range.end);
  }

  return ticks;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

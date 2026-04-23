export type XRange = {
  end: number;
  start: number;
};

export function fullXRange(length: number): XRange {
  return { end: Math.max(0, length - 1), start: 0 };
}

export function normalizeXRange(range: XRange, length: number): XRange {
  const max = Math.max(0, length - 1);
  const start = clamp(Math.round(range.start), 0, max);
  const end = clamp(Math.round(range.end), start, max);
  return { end, start };
}

export function zoomXRange(current: XRange, length: number, deltaY: number, pointerRatio = 0.5): XRange {
  if (length <= 2) return fullXRange(length);

  const max = length - 1;
  const width = Math.max(2, current.end - current.start);
  const zoomFactor = deltaY < 0 ? 0.78 : 1.28;
  const nextWidth = clamp(Math.round(width * zoomFactor), 8, max);
  const anchor = current.start + width * clamp(pointerRatio, 0, 1);
  let start = Math.round(anchor - nextWidth * pointerRatio);
  let end = start + nextWidth;

  if (start < 0) {
    end -= start;
    start = 0;
  }

  if (end > max) {
    start -= end - max;
    end = max;
  }

  return normalizeXRange({ end, start }, length);
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

import { normalizeXRange, zoomXRange } from "@/lib/analytics/chart-zoom";
import type { XRange } from "@/lib/analytics/chart-zoom";

type Props = {
  labels: string[];
  length: number;
  onChange: (range: XRange) => void;
  range: XRange;
};

export function TimeSeriesRangeBar({ labels, length, onChange, range }: Props) {
  const normalized = normalizeXRange(range, length);
  const width = Math.max(0, normalized.end - normalized.start);
  const maxStart = Math.max(0, length - width - 1);
  const startLabel = labels[normalized.start] ?? "";
  const endLabel = labels[normalized.end] ?? "";
  const disabled = length <= 1;

  function handleMove(start: number) {
    const nextStart = Math.min(maxStart, Math.max(0, start));
    onChange(normalizeXRange({ end: nextStart + width, start: nextStart }, length));
  }

  return (
    <div className="time-range-bar">
      <button disabled={disabled} onClick={() => onChange(zoomXRange(normalized, length, 1, 0.5))} title="Zoom out" type="button">
        -
      </button>
      <label>
        <input
          disabled={disabled}
          max={maxStart}
          min="0"
          onChange={(event) => handleMove(Number(event.target.value))}
          step="1"
          type="range"
          value={Math.min(normalized.start, maxStart)}
        />
        <span>
          {startLabel} - {endLabel}
        </span>
      </label>
      <button disabled={disabled} onClick={() => onChange(zoomXRange(normalized, length, -1, 0.5))} title="Zoom in" type="button">
        +
      </button>
    </div>
  );
}

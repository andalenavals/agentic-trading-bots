import { useRef, useState } from "react";
import { normalizeXRange, zoomXRangeFromCenter } from "@/lib/analytics/chart-zoom";
import type { XRange } from "@/lib/analytics/chart-zoom";
import type { PointerEvent } from "react";

type Props = {
  activePreset?: number;
  labels: string[];
  length: number;
  onChange: (range: XRange, animated?: boolean) => void;
  onPresetSelect?: (value: number) => void;
  presets?: Array<{ label: string; value: number }>;
  range: XRange;
};

export function TimeSeriesRangeBar({ activePreset, labels, length, onChange, onPresetSelect, presets, range }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragGrabRatio, setDragGrabRatio] = useState<number | null>(null);
  const normalized = normalizeXRange(range, length);
  const windowSize = normalized.end - normalized.start + 1;
  const maxStart = Math.max(0, length - windowSize);
  const startLabel = labels[normalized.start] ?? "";
  const endLabel = labels[normalized.end] ?? "";
  const disabled = length <= 1;
  const windowWidthPct = length > 0 ? (windowSize / length) * 100 : 100;
  const windowLeftPct = length > 0 ? (normalized.start / length) * 100 : 0;

  function handleMove(start: number) {
    const nextStart = Math.min(maxStart, Math.max(0, start));
    onChange(normalizeXRange({ end: nextStart + windowSize - 1, start: nextStart }, length));
  }

  function nudge(direction: -1 | 1) {
    const step = Math.max(1, Math.round(windowSize * 0.12));
    const nextStart = Math.min(maxStart, Math.max(0, normalized.start + direction * step));
    onChange(normalizeXRange({ end: nextStart + windowSize - 1, start: nextStart }, length), true);
  }

  function startFromPointer(clientX: number, grabRatio: number) {
    const track = trackRef.current;
    if (!track || disabled) return normalized.start;

    const bounds = track.getBoundingClientRect();
    const pointerRatio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return Math.round((pointerRatio - (windowSize / length) * grabRatio) * length);
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragGrabRatio(0.5);
    handleMove(startFromPointer(event.clientX, 0.5));
  }

  function handleWindowPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    setDragGrabRatio(clamp((event.clientX - bounds.left) / bounds.width, 0, 1));
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (dragGrabRatio === null) return;
    handleMove(startFromPointer(event.clientX, dragGrabRatio));
  }

  function stopDragging(event: PointerEvent<HTMLElement>) {
    if (dragGrabRatio === null) return;
    setDragGrabRatio(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="time-range-bar">
      <div className="time-range-control">
        <div
          className="time-range-track"
          ref={trackRef}
          onPointerCancel={stopDragging}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
        >
          <button
            aria-label={`Visible time range from ${startLabel} to ${endLabel}`}
            className="time-range-window"
            disabled={disabled}
            style={{ left: `${windowLeftPct}%`, width: `${windowWidthPct}%` }}
            type="button"
            onPointerCancel={stopDragging}
            onPointerDown={handleWindowPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
          />
        </div>
        <span>
          {startLabel} - {endLabel}
        </span>
      </div>
      <div className="time-range-actions">
        <div className="range-button-group horizontal">
          <button disabled={disabled || normalized.start <= 0} onClick={() => nudge(-1)} title="Move left" type="button">
            {"<"}
          </button>
          <button disabled={disabled || normalized.end >= length - 1} onClick={() => nudge(1)} title="Move right" type="button">
            {">"}
          </button>
          <button disabled={disabled} onClick={() => onChange(zoomXRangeFromCenter(normalized, length, "out"), true)} title="Zoom out" type="button">
            -
          </button>
          <button disabled={disabled} onClick={() => onChange(zoomXRangeFromCenter(normalized, length, "in"), true)} title="Zoom in" type="button">
            +
          </button>
        </div>
        {presets?.length && onPresetSelect ? (
          <div className="segmented time-range-presets">
            {presets.map((preset) => (
              <button
                className={activePreset === preset.value ? "active" : ""}
                key={preset.label}
                onClick={() => onPresetSelect(preset.value)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

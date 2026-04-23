import { useRef, useState } from "react";
import { normalizeYRange, zoomYRangeFromCenter } from "@/lib/analytics/chart-zoom";
import type { PointerEvent } from "react";
import type { YRange } from "@/lib/analytics/chart-zoom";

type Props = {
  formatter: (value: number) => string;
  fullRange: YRange;
  onChange: (range: YRange) => void;
  range: YRange;
};

export function YAxisRangeBar({ formatter, fullRange, onChange, range }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragGrabRatio, setDragGrabRatio] = useState<number | null>(null);
  const normalized = normalizeYRange(range, fullRange);
  const fullSpan = Math.max(0.000001, fullRange.max - fullRange.min);
  const windowSpan = Math.max(0.000001, normalized.max - normalized.min);
  const windowHeightPct = (windowSpan / fullSpan) * 100;
  const windowTopPct = ((fullRange.max - normalized.max) / fullSpan) * 100;
  const disabled = fullSpan <= 0.000001;

  function handleMove(nextMax: number) {
    const clampedMax = clamp(nextMax, fullRange.min + windowSpan, fullRange.max);
    onChange(normalizeYRange({ max: clampedMax, min: clampedMax - windowSpan }, fullRange));
  }

  function nudge(direction: -1 | 1) {
    handleMove(normalized.max + direction * windowSpan * 0.08);
  }

  function maxFromPointer(clientY: number, grabRatio: number) {
    const track = trackRef.current;
    if (!track || disabled) return normalized.max;

    const bounds = track.getBoundingClientRect();
    const pointerRatio = clamp((clientY - bounds.top) / bounds.height, 0, 1);
    const topRatio = pointerRatio - (windowSpan / fullSpan) * grabRatio;
    return fullRange.max - topRatio * fullSpan;
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragGrabRatio(0.5);
    handleMove(maxFromPointer(event.clientY, 0.5));
  }

  function handleWindowPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    setDragGrabRatio(clamp((event.clientY - bounds.top) / bounds.height, 0, 1));
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (dragGrabRatio === null) return;
    handleMove(maxFromPointer(event.clientY, dragGrabRatio));
  }

  function stopDragging(event: PointerEvent<HTMLElement>) {
    if (dragGrabRatio === null) return;
    setDragGrabRatio(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="y-range-bar">
      <div className="range-button-group vertical">
        <button disabled={disabled || normalized.max >= fullRange.max} onClick={() => nudge(1)} title="Move up" type="button">
          {"^"}
        </button>
        <button disabled={disabled || normalized.min <= fullRange.min} onClick={() => nudge(-1)} title="Move down" type="button">
          v
        </button>
        <button disabled={disabled} onClick={() => onChange(zoomYRangeFromCenter(normalized, fullRange, "out"))} title="Zoom out" type="button">
          -
        </button>
        <button disabled={disabled} onClick={() => onChange(zoomYRangeFromCenter(normalized, fullRange, "in"))} title="Zoom in" type="button">
          +
        </button>
      </div>
      <div className="y-range-control">
        <span>{formatter(normalized.max)}</span>
        <div
          className="y-range-track"
          ref={trackRef}
          onPointerCancel={stopDragging}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
        >
          <button
            aria-label={`Visible y range from ${formatter(normalized.min)} to ${formatter(normalized.max)}`}
            className="y-range-window"
            disabled={disabled}
            style={{ height: `${windowHeightPct}%`, top: `${windowTopPct}%` }}
            type="button"
            onPointerCancel={stopDragging}
            onPointerDown={handleWindowPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
          />
        </div>
        <span>{formatter(normalized.min)}</span>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

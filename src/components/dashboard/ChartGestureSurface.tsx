import { useEffect, useRef, useState } from "react";
import { normalizeXDomain } from "@/lib/analytics/chart-zoom";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import type { XRange } from "@/lib/analytics/chart-zoom";

type Props = {
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onXChange: (range: XRange) => void;
  style?: CSSProperties;
  xLength: number;
  xRange: XRange;
};

type PointerPoint = {
  x: number;
  y: number;
};

type GestureState = {
  moved: boolean;
  pointers: Map<number, PointerPoint>;
  startDistance: number;
  startPointers: Map<number, PointerPoint>;
  startXRange: XRange;
};

const CLICK_SUPPRESS_MS = 120;

export function ChartGestureSurface({ children, className, onClick, onXChange, style, xLength, xRange }: Props) {
  const gestureRef = useRef<GestureState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<XRange | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  function beginGesture(event: PointerEvent<HTMLDivElement>) {
    if (xLength <= 1) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    const current = gestureRef.current;
    const pointers = new Map(current?.pointers ?? []);
    pointers.set(event.pointerId, point);

    gestureRef.current = {
      moved: false,
      pointers,
      startDistance: distance(Array.from(pointers.values())),
      startPointers: new Map(pointers),
      startXRange: xRange,
    };
    setDragging(true);
  }

  function updateGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture?.pointers.has(event.pointerId)) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;

    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(gesture.pointers.values());
    const startPoints = Array.from(gesture.startPointers.values());
    const currentCenter = center(points);
    const startCenter = center(startPoints);
    const dx = currentCenter.x - startCenter.x;
    const dy = currentCenter.y - startCenter.y;

    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;

    const pinchRatio = points.length >= 2 && gesture.startDistance > 0 ? distance(points) / gesture.startDistance : 1;
    scheduleRangeUpdate(nextXRange(gesture.startXRange, xLength, bounds.width, dx, pinchRatio));
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.moved) suppressClickUntilRef.current = event.timeStamp + CLICK_SUPPRESS_MS;
    gesture.pointers.delete(event.pointerId);
    flushPendingRange();

    if (gesture.pointers.size === 0) {
      gestureRef.current = null;
      setDragging(false);
      return;
    }

    gestureRef.current = {
      moved: gesture.moved,
      pointers: new Map(gesture.pointers),
      startDistance: distance(Array.from(gesture.pointers.values())),
      startPointers: new Map(gesture.pointers),
      startXRange: xRange,
    };
  }

  function suppressDraggedClick(event: MouseEvent<HTMLDivElement>) {
    if (event.timeStamp < suppressClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onClick?.(event);
  }

  function scheduleRangeUpdate(nextRange: XRange) {
    pendingRangeRef.current = nextRange;
    if (frameRef.current !== null) return;

    // Coalesce gesture updates to one chart state update per frame on slower devices.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      commitPendingRange();
    });
  }

  function flushPendingRange() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    commitPendingRange();
  }

  function commitPendingRange() {
    const nextRange = pendingRangeRef.current;
    if (!nextRange) return;
    pendingRangeRef.current = null;
    onXChange(nextRange);
  }

  return (
    <div
      className={`${className ?? ""} gesture-surface${dragging ? " dragging" : ""}`.trim()}
      style={style}
      onClickCapture={suppressDraggedClick}
      onPointerCancel={endGesture}
      onPointerDown={beginGesture}
      onPointerMove={updateGesture}
      onPointerUp={endGesture}
    >
      {children}
      <div aria-hidden="true" className="gesture-hitbox" />
    </div>
  );
}

function nextXRange(startRange: XRange, length: number, width: number, dx: number, pinchRatio: number) {
  const max = Math.max(0, length - 1);
  const startSpan = Math.max(0.000001, startRange.end - startRange.start);
  const nextSpan = clamp(startSpan / Math.max(0.2, pinchRatio), 0.000001, max || 0.000001);
  const startCenter = (startRange.start + startRange.end) / 2;
  const centerShift = -(dx / width) * startSpan;
  return normalizeXDomain(centeredXRange(startCenter + centerShift, nextSpan), length);
}

function centeredXRange(centerValue: number, span: number): XRange {
  return { end: centerValue + span / 2, start: centerValue - span / 2 };
}

function center(points: PointerPoint[]) {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function distance(points: PointerPoint[]) {
  if (points.length < 2) return 0;
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

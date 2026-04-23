import { useEffect, useRef, useState } from "react";
import type { XRange, YRange } from "@/lib/analytics/chart-zoom";

const ANIMATION_MS = 220;

export function useAnimatedXRange(initial: XRange | null = null) {
  return useAnimatedRange<XRange>(initial, interpolateXRange);
}

export function useAnimatedYRange(initial: YRange | null = null) {
  return useAnimatedRange<YRange>(initial, interpolateYRange);
}

function useAnimatedRange<T>(initial: T | null, interpolate: (from: T, to: T, progress: number) => T) {
  const [range, setRange] = useState<T | null>(initial);
  const frameRef = useRef<number | null>(null);
  const rangeRef = useRef<T | null>(range);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  function setImmediate(next: T | null) {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    rangeRef.current = next;
    setRange(next);
  }

  function setAnimated(next: T, fallbackFrom?: T) {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const from = rangeRef.current ?? fallbackFrom ?? next;
    const started = performance.now();

    function animate(now: number) {
      const progress = easeOutCubic(Math.min(1, (now - started) / ANIMATION_MS));
      const current = interpolate(from, next, progress);
      rangeRef.current = current;
      setRange(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    }

    frameRef.current = requestAnimationFrame(animate);
  }

  return { range, setAnimated, setImmediate };
}

function interpolateXRange(from: XRange, to: XRange, progress: number): XRange {
  return {
    end: lerp(from.end, to.end, progress),
    start: lerp(from.start, to.start, progress),
  };
}

function interpolateYRange(from: YRange, to: YRange, progress: number): YRange {
  return {
    max: lerp(from.max, to.max, progress),
    min: lerp(from.min, to.min, progress),
  };
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

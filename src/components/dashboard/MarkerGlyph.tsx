import type { MarkerType } from "@/components/dashboard/VisualizationControls";

type Props = {
  alphaLevel: number;
  color: string;
  cx?: number;
  cy?: number;
  markerType: MarkerType;
  size: number;
  strokeWidth?: number;
};

export function MarkerGlyph({ alphaLevel, color, cx, cy, markerType, size, strokeWidth = 1 }: Props) {
  if (cx === undefined || cy === undefined) return <g />;
  if (markerType === "none") return <g />;
  const opacity = Math.max(0.15, Math.min(1, alphaLevel));

  if (markerType === "square") {
    return <rect fill={color} fillOpacity={opacity} height={size * 2} rx={2} stroke="#10131a" strokeWidth={strokeWidth} width={size * 2} x={cx - size} y={cy - size} />;
  }

  if (markerType === "diamond") {
    const points = `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
    return <polygon fill={color} fillOpacity={opacity} points={points} stroke="#10131a" strokeWidth={strokeWidth} />;
  }

  return <circle cx={cx} cy={cy} fill={color} fillOpacity={opacity} r={size} stroke="#10131a" strokeWidth={strokeWidth} />;
}

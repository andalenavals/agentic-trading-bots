export type ChartType = "line" | "area" | "bar";
export type MarkerType = "none" | "circle" | "square" | "diamond";

type Props = {
  alphaLevel: number;
  lineWidth: number;
  markerSize: number;
  markerType: MarkerType;
  viewportControls?: React.ReactNode;
  logScale: boolean;
  logScaleDisabled?: boolean;
  onAlphaLevelChange: (value: number) => void;
  onLineWidthChange: (value: number) => void;
  onLogScaleChange: (value: boolean) => void;
  onMarkerSizeChange: (value: number) => void;
  onMarkerTypeChange: (value: MarkerType) => void;
};

const MARKER_TYPES: MarkerType[] = ["none", "circle", "square", "diamond"];

export function VisualizationControls({
  alphaLevel,
  lineWidth,
  markerSize,
  markerType,
  viewportControls,
  logScale,
  logScaleDisabled = false,
  onAlphaLevelChange,
  onLineWidthChange,
  onLogScaleChange,
  onMarkerSizeChange,
  onMarkerTypeChange,
}: Props) {
  return (
    <details className="plot-settings">
      <summary>Plot settings</summary>
      <div className="viz-controls">
        <ControlGroup label="Y scale">
          <div className="segmented">
            <button className={!logScale ? "active" : ""} onClick={() => onLogScaleChange(false)} type="button">
              linear
            </button>
            <button
              className={logScale ? "active" : ""}
              disabled={logScaleDisabled}
              onClick={() => onLogScaleChange(true)}
              title={logScaleDisabled ? "Log scale requires positive values" : undefined}
              type="button"
            >
              log
            </button>
          </div>
        </ControlGroup>

        <ControlGroup label="Marker size">
          <label className="range-control">
            <input max="12" min="1" onChange={(event) => onMarkerSizeChange(Number(event.target.value))} step="1" type="range" value={markerSize} />
            <span>{markerSize}px</span>
          </label>
        </ControlGroup>

        <ControlGroup label="Line width">
          <label className="range-control">
            <input max="6" min="0.25" onChange={(event) => onLineWidthChange(Number(event.target.value))} step="0.25" type="range" value={lineWidth} />
            <span>{formatPixels(lineWidth)}</span>
          </label>
        </ControlGroup>

        <ControlGroup label="Marker type">
          <select value={markerType} onChange={(event) => onMarkerTypeChange(event.target.value as MarkerType)}>
            {MARKER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </ControlGroup>

        <ControlGroup label="Alpha level">
          <label className="range-control">
            <input max="1" min="0.15" onChange={(event) => onAlphaLevelChange(Number(event.target.value))} step="0.05" type="range" value={alphaLevel} />
            <span>{Math.round(alphaLevel * 100)}%</span>
          </label>
        </ControlGroup>
      </div>
      {viewportControls ? <div className="plot-settings-extra">{viewportControls}</div> : null}
    </details>
  );
}

function ControlGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="viz-control-group">
      <span>{label}</span>
      {children}
    </div>
  );
}

function formatPixels(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}px`;
}

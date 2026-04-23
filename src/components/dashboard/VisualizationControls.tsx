export type ChartType = "line" | "area" | "bar";
export type MarkerType = "circle" | "square" | "diamond";

type RangeOption = {
  label: string;
  value: number;
};

type Props = {
  alphaLevel: number;
  chartType: ChartType;
  markerSize: number;
  markerType: MarkerType;
  logScale: boolean;
  logScaleDisabled?: boolean;
  onAlphaLevelChange: (value: number) => void;
  onChartTypeChange: (value: ChartType) => void;
  onLogScaleChange: (value: boolean) => void;
  onMarkerSizeChange: (value: number) => void;
  onMarkerTypeChange: (value: MarkerType) => void;
  onRangeChange: (value: number) => void;
  range: number;
  ranges: RangeOption[];
};

const CHART_TYPES: ChartType[] = ["line", "area", "bar"];
const MARKER_TYPES: MarkerType[] = ["circle", "square", "diamond"];

export function VisualizationControls({
  alphaLevel,
  chartType,
  markerSize,
  markerType,
  logScale,
  logScaleDisabled = false,
  onAlphaLevelChange,
  onChartTypeChange,
  onLogScaleChange,
  onMarkerSizeChange,
  onMarkerTypeChange,
  onRangeChange,
  range,
  ranges,
}: Props) {
  return (
    <div className="viz-controls">
      <ControlGroup label="Range">
        <div className="segmented">
          {ranges.map((item) => (
            <button className={range === item.value ? "active" : ""} key={item.label} onClick={() => onRangeChange(item.value)} type="button">
              {item.label}
            </button>
          ))}
        </div>
      </ControlGroup>

      <ControlGroup label="View">
        <div className="segmented">
          {CHART_TYPES.map((type) => (
            <button className={chartType === type ? "active" : ""} key={type} onClick={() => onChartTypeChange(type)} type="button">
              {type}
            </button>
          ))}
        </div>
      </ControlGroup>

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
          <input max="12" min="3" onChange={(event) => onMarkerSizeChange(Number(event.target.value))} step="1" type="range" value={markerSize} />
          <span>{markerSize}px</span>
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

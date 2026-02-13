import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { VBOData } from "../models/VBOData";
import { GraphIcon, VelocityIcon, TimeDeltaIcon, VelocityDeltaIcon, TimeDeltaRateIcon } from "./Icons";
import { ChartView } from "./ChartView";
import { ChartType, CHART_TYPES, ChartProjectionMode, Projection } from "../models/charts";
import "./ChartsPanel.css";

// Icon mapping
const CHART_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  VelocityIcon: VelocityIcon,
  TimeDeltaIcon: TimeDeltaIcon,
  VelocityDeltaIcon: VelocityDeltaIcon,
  TimeDeltaRateIcon: TimeDeltaRateIcon,
};

interface ChartsPanelProps {
  data: VBOData;
  updateCounter: number;
  lapOrder: number[];
  projection: Projection;
  projectionMode: ChartProjectionMode;
  onProjectionChange: (projection: Projection) => void;
  onProjectionModeChange: (mode: ChartProjectionMode) => void;
}

export function ChartsPanel({
  data,
  updateCounter,
  lapOrder = [],
  projection,
  projectionMode,
  onProjectionChange,
  onProjectionModeChange,
}: ChartsPanelProps) 
{
  const [collapsed, setCollapsed] = useState(false);
  const [panelHeight, setPanelHeight] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedCharts, setSelectedCharts] = useState<Set<ChartType>>(
    new Set(CHART_TYPES.map((ct) => ct.type)), // All charts by default
  );
  const [chartFlexRatios, setChartFlexRatios] = useState<number[]>([]); // Flex grow per chart
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [resizeStartY, setResizeStartY] = useState<number>(0);

  // Shared X zoom and pan for all charts
  const [xZoom, setXZoom] = useState(1);
  const [xPan, setXPan] = useState(0);

  // Per-chart Y zoom and pan
  const [yZooms, setYZooms] = useState<Map<ChartType, number>>(new Map());
  const [yPans, setYPans] = useState<Map<ChartType, number>>(new Map());

  // Local mouse position for tooltip
  const [localMouseX, setLocalMouseX] = useState<number | null>(null);
  const validChartTypes = useMemo(() => new Set(CHART_TYPES.map((ct) => ct.type)), []);
  
  const onProjectionChangeRef = useRef(onProjectionChange);
  useEffect(() => 
  {
    onProjectionChangeRef.current = onProjectionChange;
  }, [onProjectionChange]);

  useEffect(() => 
  {
    setSelectedCharts((prev) => 
    {
      const next = new Set(Array.from(prev).filter((type) => validChartTypes.has(type)));
      return next.size === prev.size ? prev : next;
    });
  }, [validChartTypes]);

  const toggleChart = useCallback((type: ChartType) => 
  {
    setSelectedCharts((prev) => 
    {
      const newSet = new Set(prev);
      if (newSet.has(type)) 
      {
        newSet.delete(type);
      }
      else 
      {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => 
  {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Initialize flex ratios when chart count changes
  useEffect(() => 
  {
    const count = selectedCharts.size;
    if (count === 0) return;

    // All charts get equal flex grow
    setChartFlexRatios(Array(count).fill(1));
  }, [selectedCharts.size]);

  // Resizer for whole panel
  useEffect(() => 
  {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => 
    {
      const newHeight = Math.min(
        Math.max(window.innerHeight - e.clientY, 150),
        window.innerHeight * 0.6,
      );
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => 
    {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => 
    {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Resizer for separators between charts
  const handleSeparatorMouseDown = useCallback((index: number, e: React.MouseEvent) => 
  {
    e.preventDefault();
    setResizingIndex(index);
    setResizeStartY(e.clientY);
  }, []);

  useEffect(() => 
  {
    if (resizingIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => 
    {
      const deltaY = e.clientY - resizeStartY;
      const deltaRatio = (deltaY / (panelHeight - 40)) * 2; // Sensitivity

      setChartFlexRatios((prev) => 
      {
        const newRatios = [...prev];

        if (resizingIndex + 1 < newRatios.length) 
        {
          // Increase upper chart, decrease lower
          const newRatio1 = Math.max(0.2, newRatios[resizingIndex] + deltaRatio);
          const newRatio2 = Math.max(0.2, newRatios[resizingIndex + 1] - deltaRatio);

          newRatios[resizingIndex] = newRatio1;
          newRatios[resizingIndex + 1] = newRatio2;
        }

        return newRatios;
      });

      setResizeStartY(e.clientY);
    };

    const handleMouseUp = () => 
    {
      setResizingIndex(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => 
    {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingIndex, resizeStartY, panelHeight]);

  // Stable callback for shared cursor change (chart sends normalized 0..1)
  const handleSharedCursorChange = useCallback((normalized: number | null, mouseX: number | null) => 
  {
    setLocalMouseX(mouseX);
    onProjectionChangeRef.current(
      normalized !== null ? { type: "chart", normalized, mouseX: mouseX ?? 0 } : null
    );
  }, []);

  // Create memoized handlers map for Y zoom/pan per chart type
  const yZoomHandlers = useMemo(() => 
  {
    const handlers = new Map<ChartType, (zoom: number) => void>();
    CHART_TYPES.forEach((ct) => 
    {
      handlers.set(ct.type, (zoom: number) => 
      {
        setYZooms((prev) => new Map(prev).set(ct.type, zoom));
      });
    });
    return handlers;
  }, []);

  const yPanHandlers = useMemo(() => 
  {
    const handlers = new Map<ChartType, (pan: number) => void>();
    CHART_TYPES.forEach((ct) => 
    {
      handlers.set(ct.type, (pan: number) => 
      {
        setYPans((prev) => new Map(prev).set(ct.type, pan));
      });
    });
    return handlers;
  }, []);

  return (
    <div
      className={`charts-panel ${collapsed ? "collapsed" : ""}`}
      style={{ height: collapsed ? "40px" : `${panelHeight}px` }}
    >
      {/* Resizer at top of panel */}
      {!collapsed && (
        <div className="charts-resizer" onMouseDown={handleResizerMouseDown}>
          <div className="charts-resizer-handle"></div>
        </div>
      )}

      {/* Panel header */}
      <div className="charts-panel-header">
        <button
          className="collapse-button"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▲" : "▼"}
        </button>
        {!collapsed && (
          <>
            <h3>
              <GraphIcon size={20} /> Graphs
            </h3>
            <div className="chart-x-axis-selector">
              <span className="chart-x-axis-label">X axis:</span>
              {(["distance", "time", "normalized"] as ChartProjectionMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`chart-x-axis-button ${projectionMode === mode ? "selected" : ""}`}
                  onClick={() => onProjectionModeChange(mode)}
                  title={
                    mode === "distance"
                      ? "Projection by distance"
                      : mode === "time"
                        ? "Projection by time"
                        : "Projection by normalized position"
                  }
                >
                  {mode === "distance" ? "Dist" : mode === "time" ? "Time" : "Norm"}
                </button>
              ))}
            </div>
            <div className="chart-icons-selector">
              {CHART_TYPES.map((chartType) => 
              {
                const IconComponent = CHART_ICONS[chartType.icon];
                const isSelected = selectedCharts.has(chartType.type);

                return (
                  <button
                    key={chartType.type}
                    className={`chart-icon-button ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleChart(chartType.type)}
                    title={chartType.name}
                  >
                    <IconComponent size={20} color={isSelected ? "#FF6B00" : "#505050"} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Panel content */}
      {!collapsed && (
        <div className="charts-panel-content">
          {selectedCharts.size === 0 ? (
            <div className="charts-placeholder">
              <GraphIcon size={48} color="#505050" />
              <p style={{ marginTop: "1rem" }}>No graphs selected</p>
              <p style={{ fontSize: "0.8rem", color: "#707070" }}>Click ⚙ to select graphs</p>
            </div>
          ) : (
            <div className="charts-container">
              {Array.from(selectedCharts).map((chartType, index) => 
              {
                const flexGrow = chartFlexRatios[index] || 1;
                return (
                  <>
                    <div
                      key={chartType}
                      className="chart-wrapper"
                      style={{ flex: `${flexGrow} 1 0` }}
                    >
                      <ChartView
                        data={data}
                        chartType={chartType}
                        updateCounter={updateCounter}
                        xAxisMode={projectionMode}
                        xZoom={xZoom}
                        xPan={xPan}
                        yZoom={yZooms.get(chartType) || 1}
                        yPan={yPans.get(chartType) || 0}
                        onXZoomChange={setXZoom}
                        onXPanChange={setXPan}
                        onYZoomChange={yZoomHandlers.get(chartType) || (() => {})}
                        onYPanChange={yPanHandlers.get(chartType) || (() => {})}
                        projection={projection}
                        sharedMouseX={localMouseX}
                        onSharedCursorChange={handleSharedCursorChange}
                        lapOrder={lapOrder}
                      />
                    </div>
                    {index < selectedCharts.size - 1 && (
                      <div
                        key={`sep-${index}`}
                        className="chart-separator"
                        onMouseDown={(e) => handleSeparatorMouseDown(index, e)}
                      >
                        <div className="chart-separator-handle"></div>
                      </div>
                    )}
                  </>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

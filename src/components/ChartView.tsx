import { useEffect, useRef, useState } from "react";
import { VBOData } from "../models/VBOData";
import { ChartType, CHART_TYPES, ChartDataPoint, ChartProjectionMode, Projection } from "../models/charts";
import "./ChartView.css";

interface ChartViewProps {
  data: VBOData;
  chartType: ChartType;
  updateCounter: number;
  xAxisMode: ChartProjectionMode; // distance | time | normalized - synced with track projection
  xZoom: number;
  xPan: number;
  yZoom: number;
  yPan: number;
  onXZoomChange: (zoom: number) => void;
  onXPanChange: (pan: number) => void;
  onYZoomChange: (zoom: number) => void;
  onYPanChange: (pan: number) => void;
  projection: Projection;
  sharedMouseX: number | null;
  onSharedCursorChange: (normalized: number | null, mouseX: number | null) => void;
  lapOrder: number[];
}

interface ChartValue {
  lapIndex: number;
  lapColor: string;
  lapName: string;
  value: number;
  isFastest: boolean;
}

/** Darken hex color by factor (0..1, lower = darker) */
function darkenColor(hex: string, factor: number = 0.6): string 
{
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.round(parseInt(m[1], 16) * factor);
  const g = Math.round(parseInt(m[2], 16) * factor);
  const b = Math.round(parseInt(m[3], 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function ChartView({
  data,
  chartType,
  updateCounter,
  xAxisMode,
  xZoom,
  xPan,
  yZoom,
  yPan,
  onXZoomChange,
  onXPanChange,
  onYZoomChange,
  onYPanChange,
  projection,
  sharedMouseX,
  onSharedCursorChange,
  lapOrder,
}: ChartViewProps) 
{
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [chartValues, setChartValues] = useState<ChartValue[]>([]);
  
  // Refs for mouse position and updates (to avoid state updates on every mouse move)
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const hoverUpdateFrameRef = useRef<number | null>(null);
  const lastSharedNormalizedRef = useRef<number | null>(null);

  // Derive shared cursor normalized (0..1) from projection
  // Chart: use normalized directly. Track: use canonical X based on xAxisMode
  const sharedCursorNormalized: number | null = (() => 
  {
    if (!projection) return null;
    if (projection.type === "chart") return projection.normalized;
    // From track: canonical has distance, timeMs, normalized - pick by xAxisMode
    const fastestIdx = data.getFastestVisibleLap();
    const refLap = fastestIdx !== null ? data.laps.find((l) => l.index === fastestIdx) : null;
    const refChart = refLap?.visible ? refLap.getChart(chartType) : null;
    if (!refChart) return null;
    const { distance, timeMs, normalized } = projection.canonical;
    const totalDist = refChart.getTotalDistance();
    const totalTime = refChart.getTotalTime();
    if (xAxisMode === "distance" && totalDist > 0) 
      return Math.min(1, Math.max(0, distance / totalDist));
    if (xAxisMode === "time" && totalTime > 0) 
      return Math.min(1, Math.max(0, timeMs / totalTime));
    return Math.min(1, Math.max(0, normalized));
  })();

  // Track container size changes
  useEffect(() => 
  {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => 
    {
      const rect = container.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => 
    {
      updateDimensions();
    });

    resizeObserver.observe(container);

    return () => 
    {
      resizeObserver.disconnect();
    };
  }, []);

  // Recompute values when shared cursor normalized changes
  const chartValuesRef = useRef<ChartValue[]>([]);
  useEffect(() => 
  {
    if (sharedCursorNormalized !== null && sharedCursorNormalized >= 0 && sharedCursorNormalized <= 1) 
    {
      const visibleLaps = data.getVisibleLaps();
      const fastestLapIndex = data.getFastestVisibleLap();
      const normalizedX = sharedCursorNormalized;
      const refChart = fastestLapIndex !== null ? data.laps[fastestLapIndex]?.getChart(chartType) : null;
      const absoluteTimeMs = refChart ? normalizedX * refChart.getTotalTime() : 0;
      const absoluteDistance = refChart ? normalizedX * refChart.getTotalDistance() : 0;

      const values: ChartValue[] = [];
      visibleLaps.forEach((lap) => 
      {
        const chart = lap.getChart(chartType);
        if (!chart) return;

        // Time/distance mode: same absolute position for all laps. Normalized: fraction per lap
        let value: number | null = null;
        if (xAxisMode === "distance") 
        {
          value = chart.getValueAtDistance(absoluteDistance);
        }
        else if (xAxisMode === "time") 
        {
          value = chart.getValueAtTime(absoluteTimeMs);
        }
        else 
        {
          value = chart.getValueAtNormalized(normalizedX);
        }
        if (value === null) return;

        values.push({
          lapIndex: lap.index,
          lapColor: lap.color,
          lapName: `Lap ${lap.index + 1}`,
          value: value,
          isFastest: lap.index === fastestLapIndex,
        });
      });

      // Sort values by table order
      if (lapOrder.length > 0 && values.length > 1) 
      {
        const orderMap = new Map<number, number>();
        lapOrder.forEach((lapIndex, position) => 
        {
          orderMap.set(lapIndex, position);
        });

        values.sort((a, b) => 
        {
          const posA = orderMap.get(a.lapIndex);
          const posB = orderMap.get(b.lapIndex);

          if (posA === undefined || posB === undefined) 
          {
            return a.lapIndex - b.lapIndex;
          }

          return posA - posB;
        });
      }

      // Only update if values changed
      const valuesChanged =
        chartValuesRef.current.length !== values.length ||
        chartValuesRef.current.some((a, i) => 
        {
          const b = values[i];
          return (
            !b ||
            a.lapIndex !== b.lapIndex ||
            Math.abs(a.value - b.value) > 0.001
          );
        });

      if (valuesChanged) 
      {
        chartValuesRef.current = values;
        setChartValues(values);
      }
    }
    else 
    {
      if (chartValuesRef.current.length > 0) 
      {
        chartValuesRef.current = [];
        setChartValues([]);
      }
    }
  }, [sharedCursorNormalized, data, chartType, lapOrder, xAxisMode]);

  useEffect(() => 
  {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get visible laps
    const visibleLaps = data.getVisibleLaps();
    if (visibleLaps.length === 0) return;

    // Compute maxX and getPointX based on xAxisMode (synced with track projection)
    let maxX: number;
    const getPointX = (point: ChartDataPoint): number => 
    {
      if (xAxisMode === "distance") return point.distance;
      if (xAxisMode === "time") return point.time / 1000; // seconds for display
      return point.normalized;
    };
    if (xAxisMode === "distance") 
    {
      maxX = Math.max(...visibleLaps.map((lap) => lap.getChart(chartType)?.getTotalDistance() ?? 0), 1);
    }
    else if (xAxisMode === "time") 
    {
      maxX = Math.max(...visibleLaps.map((lap) => (lap.getChart(chartType)?.getTotalTime() ?? 0) / 1000), 0.001);
    }
    else 
    {
      maxX = 1;
    }

    // Find common Y range for all visible laps
    let minY = Infinity;
    let maxY = -Infinity;
    visibleLaps.forEach((lap) => 
    {
      const chart = lap.getChart(chartType);
      if (chart) 
      {
        minY = Math.min(minY, chart.getMinValue());
        maxY = Math.max(maxY, chart.getMaxValue());
      }
    });

    if (minY === Infinity || maxY === -Infinity) return;

    // Add padding for Y
    const yRange = maxY - minY;
    const yPadding = yRange * 0.1;
    minY -= yPadding;
    maxY += yPadding;

    const padding = { left: 50, right: 20, top: 20, bottom: 30 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    // Chart center for zoom/pan transforms
    const centerX = chartWidth / 2;
    const centerY = chartHeight / 2;

    const toScreenX = (xValue: number) => 
    {
      const normalizedX = maxX > 0 ? xValue / maxX : 0;
      const baseX = normalizedX * chartWidth;
      return padding.left + (baseX - centerX) * xZoom + centerX + xPan;
    };

    const toScreenY = (value: number) => 
    {
      const normalizedY = (value - minY) / (maxY - minY); // [0, 1]
      const baseY = normalizedY * chartHeight; // Base position without zoom/pan
      // Apply zoom around center, then pan (Y is inverted)
      return canvas.height - padding.bottom - ((baseY - centerY) * yZoom + centerY + yPan);
    };

    // Draw axes
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
    ctx.stroke();

    // Draw Y grid (5 lines)
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.font = "11px monospace";
    ctx.fillStyle = "#808080";
    for (let i = 0; i <= 4; i++) 
    {
      const value = minY + (maxY - minY) * (i / 4);
      const y = toScreenY(value);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();

      ctx.fillText(value.toFixed(1), 5, y + 4);
    }

    // Draw chart lines for each visible lap (with sector tone alternation at detection lines)
    const hasSectors = (data.trackData?.sectors?.length ?? 0) > 0;

    visibleLaps.forEach((lap) => 
    {
      const chart = lap.getChart(chartType);
      if (!chart || chart.points.length === 0) return;

      const baseColor = lap.color;
      const darkColor = darkenColor(baseColor);

      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (!hasSectors) 
      {
        ctx.strokeStyle = baseColor;
        ctx.beginPath();
        const firstPoint = chart.points[0];
        ctx.moveTo(toScreenX(getPointX(firstPoint)), toScreenY(firstPoint.value));
        for (let i = 1; i < chart.points.length; i++) 
        {
          const point = chart.points[i];
          ctx.lineTo(toScreenX(getPointX(point)), toScreenY(point.value));
        }
        ctx.stroke();
        return;
      }

      let currentSector = 0;
      let strokeColor = (currentSector & 1) === 0 ? darkColor : baseColor;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      const firstPoint = chart.points[0];
      ctx.moveTo(toScreenX(getPointX(firstPoint)), toScreenY(firstPoint.value));

      for (let i = 1; i < chart.points.length; i++) 
      {
        const point = chart.points[i];
        const sb = point.sectorBoundaryIndex;

        if (sb !== undefined) 
        {
          ctx.lineTo(toScreenX(getPointX(point)), toScreenY(point.value));
          ctx.stroke();

          currentSector = sb + 1;
          strokeColor = (currentSector & 1) === 0 ? darkColor : baseColor;
          ctx.strokeStyle = strokeColor;
          ctx.beginPath();
          ctx.moveTo(toScreenX(getPointX(point)), toScreenY(point.value));
        }
        else 
        {
          ctx.lineTo(toScreenX(getPointX(point)), toScreenY(point.value));
        }
      }
      ctx.stroke();
    });

    // Get chart name
    const sampleChart = visibleLaps[0]?.getChart(chartType);
    if (sampleChart) 
    {
      // Draw title, units, and X axis mode
      ctx.fillStyle = "#e0e0e0";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`${sampleChart.name} (${sampleChart.unit})`, padding.left + 5, 15);
      ctx.fillStyle = "#707070";
      ctx.font = "10px sans-serif";
      ctx.fillText(
        xAxisMode === "distance" ? "Distance (m)" : xAxisMode === "time" ? "Time (s)" : "Progress (0..1)",
        padding.left + 5,
        canvas.height - 8,
      );

      // Show zoom/pan when not default
      if (xZoom !== 1 || yZoom !== 1 || xPan !== 0 || yPan !== 0) 
      {
        ctx.fillStyle = "#808080";
        ctx.font = "10px monospace";
        ctx.fillText(
          `zoom: ${xZoom.toFixed(1)}x, ${yZoom.toFixed(1)}x`,
          canvas.width - padding.right - 100,
          15,
        );
      }
    }

    // Draw cursor projection on charts (points and delta lines)
    if (sharedCursorNormalized !== null && sharedCursorNormalized >= 0 && sharedCursorNormalized <= 1) 
    {
      const fastestLapIndex = data.getFastestVisibleLap();
      const cursorNormalized = Math.min(1, Math.max(0, sharedCursorNormalized));
      const refChart = fastestLapIndex !== null ? data.laps[fastestLapIndex]?.getChart(chartType) : null;
      const cursorXValue =
        xAxisMode === "distance" && refChart
          ? cursorNormalized * refChart.getTotalDistance()
          : xAxisMode === "time" && refChart
            ? (cursorNormalized * refChart.getTotalTime()) / 1000
            : cursorNormalized;
      const lineX = toScreenX(cursorXValue);

      // Draw projection points and delta lines
      let referenceValue: number | null = null;
      let referenceY: number | null = null;

      // For time/distance mode: cursor is at ABSOLUTE position (same time/distance for all laps)
      // For normalized: cursor is at fraction of each lap
      const absoluteTimeMs = refChart ? cursorNormalized * refChart.getTotalTime() : 0;
      const absoluteDistance = refChart ? cursorNormalized * refChart.getTotalDistance() : 0;

      // Find reference value (fastest lap) first
      if (fastestLapIndex !== null) 
      {
        const refLap = data.laps[fastestLapIndex];
        if (refLap && refLap.visible) 
        {
          const refChartInner = refLap.getChart(chartType);
          if (refChartInner) 
          {
            referenceValue =
              xAxisMode === "distance"
                ? refChartInner.getValueAtDistance(absoluteDistance)
                : xAxisMode === "time"
                  ? refChartInner.getValueAtTime(absoluteTimeMs)
                  : refChartInner.getValueAtNormalized(cursorNormalized);
            if (referenceValue !== null) 
            {
              referenceY = toScreenY(referenceValue);
            }
          }
        }
      }

      // Draw points and delta lines for each lap
      visibleLaps.forEach((lap) => 
      {
        const chart = lap.getChart(chartType);
        if (!chart) return;

        const value =
          xAxisMode === "distance"
            ? chart.getValueAtDistance(absoluteDistance)
            : xAxisMode === "time"
              ? chart.getValueAtTime(absoluteTimeMs)
              : chart.getValueAtNormalized(cursorNormalized);
        if (value === null) return;

        const pointY = toScreenY(value);
        const isFastest = lap.index === fastestLapIndex;

        // Draw delta line (if not fastest and reference exists)
        if (!isFastest && referenceY !== null && referenceValue !== null) 
        {
          const delta = value - referenceValue;

          // Color based on higherIsBetter
          let lineColor: string;
          if (chart.higherIsBetter) 
          {
            // Higher is better: positive delta = green
            lineColor = delta > 0 ? "#00ff00" : "#ff6666";
          }
          else 
          {
            // Lower is better: negative delta = green
            lineColor = delta < 0 ? "#00ff00" : "#ff6666";
          }

          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);

          ctx.beginPath();
          ctx.moveTo(lineX, referenceY);
          ctx.lineTo(lineX, pointY);
          ctx.stroke();

          ctx.setLineDash([]);
        }

        // Draw projection point (half size)
        ctx.fillStyle = lap.color;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        const pointSize = 2.5;

        ctx.beginPath();
        ctx.arc(lineX, pointY, pointSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });
    }

    // Draw horizontal line from local cursor (only when cursor is over this chart)
    // Use ref to avoid dependency on frequently changing state
    const currentMousePos = mousePosRef.current;
    if (currentMousePos) 
    {
      const mouseX = currentMousePos.x;
      const mouseY = currentMousePos.y;

      if (
        mouseX >= padding.left &&
        mouseX <= canvas.width - padding.right &&
        mouseY >= padding.top &&
        mouseY <= canvas.height - padding.bottom
      ) 
      {
        ctx.strokeStyle = "#FF6B00";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(padding.left, mouseY);
        ctx.lineTo(canvas.width - padding.right, mouseY);
        ctx.stroke();

        ctx.setLineDash([]);
      }
    }
  }, [
    data,
    chartType,
    xAxisMode,
    dimensions,
    updateCounter,
    xZoom,
    xPan,
    yZoom,
    yPan,
    sharedCursorNormalized,
    sharedMouseX,
  ]);

  // Zoom handler (mouse wheel) - zoom around cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => 
  {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padding = { left: 50, right: 20, top: 20, bottom: 30 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const shiftPressed = e.shiftKey;

    if (shiftPressed) 
    {
      // Y zoom only when Shift pressed
      const mouseChartY = mouseY - padding.top;
      const worldY = (mouseChartY / chartHeight - yPan) / yZoom;

      const newYZoom = Math.max(0.1, Math.min(10, yZoom * zoomFactor));
      const newYPan = mouseChartY / chartHeight - worldY * newYZoom;

      onYZoomChange(newYZoom);
      onYPanChange(newYPan);
    }
    else 
    {
      // Zoom both axes in sync (same value) around cursor
      const mouseChartX = mouseX - padding.left;
      const mouseChartY = mouseY - padding.top;

      // Use current value (average if different)
      const currentZoom = (xZoom + yZoom) / 2;
      let newZoom = currentZoom * zoomFactor;

      // Apply limits
      newZoom = Math.max(1, Math.min(5, newZoom));

      const newXPan = xPan + (mouseChartX - chartWidth / 2) * (1 - newZoom / xZoom);
      const newYPan = yPan + (mouseChartY - chartHeight / 2) * (1 - newZoom / yZoom);

      // Set SAME zoom for both axes
      onXZoomChange(newZoom);
      onXPanChange(newXPan);
      onYZoomChange(newZoom);
      onYPanChange(newYPan);
    }
  };

  // Pan handlers (drag)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => 
  {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => 
  {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Update mouse position ref immediately (no state update)
    mousePosRef.current = { x: mouseX, y: mouseY };

    if (isDragging) 
    {
      // Handle panning
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Pan in pixels - moves in sync with cursor
      onXPanChange(xPan + deltaX);
      onYPanChange(yPan - deltaY); // Invert Y because canvas Y axis is inverted

      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Handle hover - use requestAnimationFrame to throttle updates
    // Cancel previous frame if any
    if (hoverUpdateFrameRef.current !== null) 
    {
      cancelAnimationFrame(hoverUpdateFrameRef.current);
    }

    // Schedule update via requestAnimationFrame
    hoverUpdateFrameRef.current = requestAnimationFrame(() => 
    {
      const padding = { left: 50, right: 20, top: 20, bottom: 30 };

      if (
        mouseX >= padding.left &&
        mouseX <= canvas.width - padding.right &&
        mouseY >= padding.top &&
        mouseY <= canvas.height - padding.bottom
      ) 
      {
        const chartWidth = canvas.width - padding.left - padding.right;
        const centerX = chartWidth / 2;

        const visibleLaps = data.getVisibleLaps();
        const maxX =
          xAxisMode === "distance"
            ? Math.max(...visibleLaps.map((lap) => lap.getChart(chartType)?.getTotalDistance() ?? 0), 1)
            : xAxisMode === "time"
              ? Math.max(...visibleLaps.map((lap) => (lap.getChart(chartType)?.getTotalTime() ?? 0) / 1000), 0.001)
              : 1;

        const baseX = (mouseX - padding.left - centerX - xPan) / xZoom + centerX;
        const rawX = Math.max(0, Math.min(1, baseX / chartWidth)) * maxX; // raw value in chart units

        const fastestIdx = data.getFastestVisibleLap();
        const refLap = fastestIdx !== null ? data.laps[fastestIdx] : null;
        const refChart = refLap?.visible ? refLap.getChart(chartType) : null;

        if (refChart) 
        {
          let normalizedX: number;
          if (xAxisMode === "distance") 
          {
            const totalDist = refChart.getTotalDistance();
            normalizedX = totalDist > 0 ? Math.min(1, rawX / totalDist) : 0;
          }
          else if (xAxisMode === "time") 
          {
            const totalTimeSec = refChart.getTotalTime() / 1000;
            normalizedX = totalTimeSec > 0 ? Math.min(1, rawX / totalTimeSec) : 0;
          }
          else 
          {
            normalizedX = rawX;
          }

          if (
            lastSharedNormalizedRef.current === null ||
            Math.abs(lastSharedNormalizedRef.current - normalizedX) > 0.0005
          ) 
          {
            lastSharedNormalizedRef.current = normalizedX;
            onSharedCursorChange(normalizedX, mouseX);
          }
        }
        else 
        {
          if (lastSharedNormalizedRef.current !== null) 
          {
            lastSharedNormalizedRef.current = null;
            onSharedCursorChange(null, null);
          }
        }
      }
      else 
      {
        if (lastSharedNormalizedRef.current !== null) 
        {
          lastSharedNormalizedRef.current = null;
          onSharedCursorChange(null, null);
        }
      }

      hoverUpdateFrameRef.current = null;
    });
  };

  const handleMouseUp = () => 
  {
    setIsDragging(false);
  };

  const handleMouseLeave = () => 
  {
    setIsDragging(false);
    mousePosRef.current = null;
    lastSharedNormalizedRef.current = null;
    // Cancel pending hover update
    if (hoverUpdateFrameRef.current !== null) 
    {
      cancelAnimationFrame(hoverUpdateFrameRef.current);
      hoverUpdateFrameRef.current = null;
    }
    onSharedCursorChange(null, null);
  };

  // Reset zoom/pan
  const handleReset = () => 
  {
    onXZoomChange(1);
    onXPanChange(0);
    onYZoomChange(1);
    onYPanChange(0);
  };

  const hasTransform = xZoom !== 1 || yZoom !== 1 || xPan !== 0 || yPan !== 0;

  // Compute reference value for delta
  const fastestLapIndex = data.getFastestVisibleLap();
  const refValue =
    fastestLapIndex !== null
      ? chartValues.find((v) => v.lapIndex === fastestLapIndex)?.value
      : null;

  // Get chart name
  const chartName = CHART_TYPES.find((ct) => ct.type === chartType)?.name || "";
  const sampleChart = data.getVisibleLaps()[0]?.getChart(chartType);
  const unit = sampleChart?.unit || "";

  return (
    <div className="chart-view" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="chart-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? "grabbing" : "default" }}
      />
      {hasTransform && (
        <button className="chart-reset-button" onClick={handleReset} title="Reset zoom/pan">
          ⟲
        </button>
      )}

      {/* Tooltip with values - shown when sharedCursorNormalized is set */}
      {chartValues.length > 0 &&
        sharedCursorNormalized !== null &&
        sharedCursorNormalized >= 0 &&
        sharedCursorNormalized <= 1 &&
        (() => 
        {
          const tooltipWidth = 180;
          const gapRight = 15;
          const gapLeft = 45; // Larger gap when tooltip is left of cursor to avoid overlap

          // Cursor X: sharedMouseX if set, else from chart line position
          let cursorX = 0;
          if (sharedMouseX !== null) 
          {
            cursorX = sharedMouseX;
          }
          else 
          {
            const padding = { left: 50, right: 20, top: 20, bottom: 30 };
            const chartWidth = dimensions.width - padding.left - padding.right;
            const centerX = chartWidth / 2;
            const visibleLaps = data.getVisibleLaps();
            const maxX =
              xAxisMode === "distance"
                ? Math.max(...visibleLaps.map((lap) => lap.getChart(chartType)?.getTotalDistance() ?? 0), 1)
                : xAxisMode === "time"
                  ? Math.max(...visibleLaps.map((lap) => (lap.getChart(chartType)?.getTotalTime() ?? 0) / 1000), 0.001)
                  : 1;
            const norm = Math.min(1, Math.max(0, sharedCursorNormalized));
            const refChart = fastestLapIndex !== null ? data.laps[fastestLapIndex]?.getChart(chartType) : null;
            const cursorXValue =
              xAxisMode === "distance" && refChart
                ? norm * refChart.getTotalDistance()
                : xAxisMode === "time" && refChart
                  ? (norm * refChart.getTotalTime()) / 1000
                  : norm;
            const baseX = (maxX > 0 ? cursorXValue / maxX : 0) * chartWidth;
            cursorX = padding.left + (baseX - centerX) * xZoom + centerX + xPan;
          }

          // Place tooltip right of cursor; if would overlap cursor near right edge, place left
          let tooltipX: number;
          if (cursorX + gapRight + tooltipWidth <= dimensions.width - 10) 
          {
            tooltipX = cursorX + gapRight;
          }
          else 
          {
            tooltipX = Math.max(10, cursorX - tooltipWidth - gapLeft);
          }

          return (
            <div
              className="chart-tooltip"
              style={{
                left: `${tooltipX}px`,
                top: "10px",
              }}
            >
              <div className="chart-tooltip-title">
                {chartName} ({unit})
              </div>
              {chartValues.map((cv) => 
              {
                // Compute delta considering higherIsBetter
                let delta = null;
                let deltaColor = "";
                if (refValue !== null && refValue !== undefined && !cv.isFastest) 
                {
                  const deltaVal = cv.value - refValue;
                  delta = deltaVal >= 0 ? `+${deltaVal.toFixed(2)}` : deltaVal.toFixed(2);

                  // Color based on chart logic
                  if (sampleChart?.higherIsBetter) 
                  {
                    // Higher is better: positive delta = green
                    deltaColor = deltaVal > 0 ? "#00ff00" : "#ff6666";
                  }
                  else 
                  {
                    // Lower is better: negative delta = green
                    deltaColor = deltaVal < 0 ? "#00ff00" : "#ff6666";
                  }
                }

                return (
                  <div key={cv.lapIndex} className="chart-tooltip-row">
                    <span
                      className="chart-tooltip-color"
                      style={{ backgroundColor: cv.lapColor }}
                    />
                    <span className="chart-tooltip-flag">{cv.isFastest ? "🏁" : ""}</span>
                    <span className="chart-tooltip-lap">{cv.lapName}</span>
                    <span className="chart-tooltip-value">{cv.value.toFixed(2)}</span>
                    <span
                      className="chart-tooltip-delta"
                      style={{ color: delta ? deltaColor : "transparent" }}
                    >
                      {delta || ""}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}
    </div>
  );
}

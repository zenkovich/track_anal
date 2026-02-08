import { useCallback, useEffect, useRef, useState } from "react";
import { TileCache, calculateZoom, getTilesForBounds, tileToLatLng } from "../utils/tiles";
import { VBOData } from "../models/VBOData";
import { metersToGps, gpsToMeters } from "../utils/vboParser";
import "./TrackVisualizer.css";

interface TrackVisualizerProps {
  data: VBOData;
  showTiles?: boolean;
  onToggleTiles?: () => void;
  onReset?: () => void;
  resetKey?: number;
  showSettingsPanel?: boolean;
  updateCounter?: number; // Force re-render
  tolerancePercent?: number;
  onToleranceChange?: (tolerance: number) => void;
  lapOrder?: number[]; // Lap indices order for display
  projectionDistance?: number | null; // Distance for synced projection
  onProjectionDistanceChange?: (distance: number | null) => void;
}

interface ViewState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface TrackPoint {
  lapIndex: number;
  lapColor: string;
  lapName: string;
  distance: number; // Distance from lap start (m)
  time: string; // Time from lap start
  timeMs: number; // Time in ms (for delta calculation)
  velocity: number; // Velocity (km/h)
  x: number; // Screen X coordinate
  y: number; // Screen Y coordinate
  isFastest: boolean; // Fastest lap
}

export function TrackVisualizer({
  data,
  showTiles: showTilesProp = true,
  resetKey,
  showSettingsPanel: showSettingsPanelProp = false,
  updateCounter = 0,
  tolerancePercent = 15,
  onToleranceChange,
  lapOrder = [],
  projectionDistance = null,
  onProjectionDistanceChange,
}: TrackVisualizerProps) 
{
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [viewState, setViewState] = useState<ViewState>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

  const [baseParams, setBaseParams] = useState<{
    baseScale: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [tiles, setTiles] = useState<Map<string, HTMLImageElement>>(new Map());
  const [tileZoom, setTileZoom] = useState(0);
  const [showTileBorders, setShowTileBorders] = useState(false);
  const [showTileLabels, setShowTileLabels] = useState(false);
  const [showStartFinishDebug, setShowStartFinishDebug] = useState(false);
  const [showHoverDebug, setShowHoverDebug] = useState(false);
  const tileCacheRef = useRef(new TileCache("google"));

  const [hoveredPoints, setHoveredPoints] = useState<TrackPoint[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [debugHoverData, setDebugHoverData] = useState<{
    mouseMeters: { x: number; y: number };
    searchRadius: number;
    minDistance: number;
    checkedSegments: Array<{
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      proj: { x: number; y: number };
      dist: number;
      inRange: boolean;
    }>;
  } | null>(null);

  const showTiles = showTilesProp;
  const showSettingsPanel = showSettingsPanelProp;

  useEffect(() => 
  {
    if (dimensions.width > 0 && dimensions.height > 0 && data.rows.length > 0) 
    {
      const bbox = data.boundingBox;
      const padding = 40;

      const availableWidth = dimensions.width - 2 * padding;
      const availableHeight = dimensions.height - 2 * padding;

      const scaleX = availableWidth / bbox.width;
      const scaleY = availableHeight / bbox.height;
      const baseScale = Math.min(scaleX, scaleY);

      const centerX = bbox.centerLong;
      const centerY = bbox.centerLat;

      const zoom = calculateZoom(
        bbox.minLat,
        bbox.maxLat,
        bbox.minLong,
        bbox.maxLong,
        dimensions.width,
        dimensions.height,
      );

      setTileZoom(zoom);
      setBaseParams({ baseScale, centerX, centerY });

      setViewState({
        offsetX: dimensions.width / 2,
        offsetY: dimensions.height / 2,
        scale: 1,
      });
    }
  }, [dimensions, data]);

  useEffect(() => 
  {
    const updateDimensions = () => 
    {
      if (containerRef.current) 
      {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = rect.width;
        const newHeight = rect.height;

        setDimensions((prev) => 
        {
          if (prev.width !== newWidth || prev.height !== newHeight) 
          {
            return { width: newWidth, height: newHeight };
          }
          return prev;
        });
      }
    };

    // Initial size
    updateDimensions();

    // ResizeObserver to track container size changes
    const resizeObserver = new ResizeObserver(() => 
    {
      updateDimensions();
    });

    if (containerRef.current) 
    {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize
    window.addEventListener("resize", updateDimensions);

    return () => 
    {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  useEffect(() => 
  {
    if (resetKey !== undefined && resetKey > 0) 
    {
      setViewState({
        offsetX: dimensions.width / 2,
        offsetY: dimensions.height / 2,
        scale: 1,
      });
    }
  }, [resetKey, dimensions.width, dimensions.height]);

  useEffect(() => 
  {
    if (!tileZoom || !data.rows.length || !showTiles) 
    {
      setTiles(new Map());
      return;
    }

    let cancelled = false;
    const bbox = data.boundingBox;
    const tilesToLoad = getTilesForBounds(
      bbox.minLat,
      bbox.maxLat,
      bbox.minLong,
      bbox.maxLong,
      tileZoom,
    );

    const loadTiles = async () => 
    {
      const loaded = new Map<string, HTMLImageElement>();
      const cache = tileCacheRef.current;

      for (const tile of tilesToLoad) 
      {
        if (cancelled) break;
        try 
        {
          const img = await cache.load(tile);
          if (!cancelled) 
          {
            loaded.set(`${tile.z}/${tile.x}/${tile.y}`, img);
          }
        }
        catch 
        {
          // Ignore individual tile load errors
        }
      }

      if (!cancelled) 
      {
        setTiles(loaded);
      }
    };

    loadTiles();

    return () => 
    {
      cancelled = true;
    };
  }, [tileZoom, data.boundingBox, showTiles]);

  useEffect(() => 
  {
    return () => 
    {
      if (animationFrameRef.current !== null) 
      {
        cancelAnimationFrame(animationFrameRef.current);
      }
      tileCacheRef.current.clear();
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => 
  {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewState((prev) => 
    {
      const newScale = Math.max(0.1, Math.min(50, prev.scale * zoomFactor));
      const worldX = (mouseX - prev.offsetX) / prev.scale;
      const worldY = (mouseY - prev.offsetY) / prev.scale;
      return {
        offsetX: mouseX - worldX * newScale,
        offsetY: mouseY - worldY * newScale,
        scale: newScale,
      };
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => 
    {
      setIsDragging(true);
      setDragStart({ x: e.clientX - viewState.offsetX, y: e.clientY - viewState.offsetY });
    },
    [viewState.offsetX, viewState.offsetY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => 
    {
      if (isDragging) 
      {
        setViewState((prev) => ({
          ...prev,
          offsetX: e.clientX - dragStart.x,
          offsetY: e.clientY - dragStart.y,
        }));
      }
      else 
      {
        // Handle hover to show trajectory parameters
        const canvas = canvasRef.current;
        if (!canvas || !baseParams) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setMousePos({ x: mouseX, y: mouseY });

        // Clear projectionDistance on local hover to avoid conflicts
        if (onProjectionDistanceChange) 
        {
          onProjectionDistanceChange(null);
        }

        // Convert screen coords to world coords (canvas local coords)
        const worldX = (mouseX - viewState.offsetX) / viewState.scale;
        const worldY = (mouseY - viewState.offsetY) / viewState.scale;

        // Convert world coords to GPS
        const mouseLong = worldX / baseParams.baseScale + baseParams.centerX;
        const mouseLat = -worldY / baseParams.baseScale + baseParams.centerY;

        // Convert GPS to track metric coords (same as VBODataRow.x, VBODataRow.y)
        const bbox = data.boundingBox;
        const mouseMeters = gpsToMeters(mouseLat, mouseLong, bbox.minLat, bbox.minLong);

        // Convert pixels to meters
        // 1 screen pixel = (1 / viewState.scale) local units
        // 1 local unit = (1 / baseParams.baseScale) degrees
        // 1 degree ≈ 111km at bbox.centerLat
        const metersPerDegree = 111000 * Math.cos((bbox.centerLat * Math.PI) / 180);
        const metersPerLocalUnit = metersPerDegree / baseParams.baseScale;
        const metersPerPixel = metersPerLocalUnit / viewState.scale;

        // Threshold: 50 pixels
        const minDistancePixels = 50;
        const minDistanceMeters = minDistancePixels * metersPerPixel;
        const searchRadiusMeters = minDistanceMeters * 2;

        const checkedSegments: Array<{
          p1: { x: number; y: number };
          p2: { x: number; y: number };
          proj: { x: number; y: number };
          dist: number;
          inRange: boolean;
        }> = [];

        const foundPoints: TrackPoint[] = [];

        // Find fastest lap among visible
        const fastestLapIndex = data.getFastestVisibleLap();

        // Find nearest points for each visible lap
        data.laps.forEach((lap) => 
        {
          if (!lap.visible) return;

          let closestDist = Infinity;
          let closestPoint: TrackPoint | null = null;

          const rows = lap.rows;

          for (let i = 1; i < rows.length; i++) 
          {
            const p1 = rows[i - 1];
            const p2 = rows[i];

            // Quick check: skip far segments
            const minX = Math.min(p1.x, p2.x) - searchRadiusMeters;
            const maxX = Math.max(p1.x, p2.x) + searchRadiusMeters;
            const minY = Math.min(p1.y, p2.y) - searchRadiusMeters;
            const maxY = Math.max(p1.y, p2.y) + searchRadiusMeters;

            if (
              mouseMeters.x < minX ||
              mouseMeters.x > maxX ||
              mouseMeters.y < minY ||
              mouseMeters.y > maxY
            ) 
            {
              continue;
            }

            // Project cursor onto segment
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength < 0.001) continue;

            // Projection parameter t [0, 1]
            const t = Math.max(
              0,
              Math.min(
                1,
                ((mouseMeters.x - p1.x) * dx + (mouseMeters.y - p1.y) * dy) /
                  (segmentLength * segmentLength),
              ),
            );

            // Projection point on segment
            const projX = p1.x + t * dx;
            const projY = p1.y + t * dy;

            // Distance from cursor to projection
            const dist = Math.sqrt(
              (mouseMeters.x - projX) * (mouseMeters.x - projX) +
                (mouseMeters.y - projY) * (mouseMeters.y - projY),
            );

            // Store for debug drawing
            checkedSegments.push({
              p1: { x: p1.x, y: p1.y },
              p2: { x: p2.x, y: p2.y },
              proj: { x: projX, y: projY },
              dist: dist,
              inRange: dist < minDistanceMeters,
            });

            if (dist < minDistanceMeters && dist < closestDist) 
            {
              closestDist = dist;

              // Interpolate parameters
              const velocity = p1.velocity + t * (p2.velocity - p1.velocity);

              // Interpolate distance from lap start (use precomputed values)
              const p1DistFromStart = p1.lapDistanceFromStart || 0;
              const p2DistFromStart = p2.lapDistanceFromStart || 0;
              const distanceFromStart = p1DistFromStart + t * (p2DistFromStart - p1DistFromStart);

              // Format time like in laps list: M:SS.mmm
              const formatTimeTooltip = (ms: number): string => 
              {
                if (isNaN(ms) || ms < 0) return "0:00.000";
                const totalSeconds = ms / 1000;
                const minutes = Math.floor(totalSeconds / 60);
                const secondsRemainder = totalSeconds - minutes * 60;
                const secWhole = Math.floor(secondsRemainder);
                const secFrac = Math.floor((secondsRemainder - secWhole) * 1000);
                return `${minutes}:${secWhole.toString().padStart(2, "0")}.${secFrac.toString().padStart(3, "0")}`;
              };

              // Interpolate time from lap start (use precomputed values)
              const p1TimeFromStart = p1.lapTimeFromStart || 0;
              const p2TimeFromStart = p2.lapTimeFromStart || 0;
              const timeFromStart = p1TimeFromStart + t * (p2TimeFromStart - p1TimeFromStart);

              // Debug time output for first close segment of each lap
              if (
                showHoverDebug &&
                lap.index <= 2 &&
                dist < minDistanceMeters &&
                closestDist === Infinity
              ) 
              {
                console.log(
                  `[Hover] Lap ${lap.index}, segment ${i}/${rows.length}, dist=${dist.toFixed(2)}m:`,
                );
                console.log(
                  `  p1: time="${p1.time}", lapTimeFromStart=${p1.lapTimeFromStart}, using=${p1TimeFromStart}ms`,
                );
                console.log(
                  `  p2: time="${p2.time}", lapTimeFromStart=${p2.lapTimeFromStart}, using=${p2TimeFromStart}ms`,
                );
                console.log(
                  `  t=${t.toFixed(3)}, result=${timeFromStart.toFixed(1)}ms = ${formatTimeTooltip(timeFromStart)}`,
                );

                // Check lap points
                console.log(
                  `  Lap has ${rows.length} points, first.time="${rows[0].time}", last.time="${rows[rows.length - 1].time}"`,
                );
              }

              // Convert projection (meters) back to screen coords
              // 1. Meters -> GPS
              const projGps = metersToGps(projX, projY, bbox.minLat, bbox.minLong);
              // 2. GPS -> canvas local coords
              const projLocalX = (projGps.long - baseParams.centerX) * baseParams.baseScale;
              const projLocalY = -(projGps.lat - baseParams.centerY) * baseParams.baseScale;
              // 3. Local -> screen
              const screenX = projLocalX * viewState.scale + viewState.offsetX;
              const screenY = projLocalY * viewState.scale + viewState.offsetY;

              closestPoint = {
                lapIndex: lap.index,
                lapColor: lap.color,
                lapName: `Lap ${lap.index + 1}`,
                distance: distanceFromStart,
                time: formatTimeTooltip(timeFromStart),
                timeMs: timeFromStart,
                velocity: velocity,
                x: screenX,
                y: screenY,
                isFastest: lap.index === fastestLapIndex,
              };
            }
          }

          if (closestPoint) 
          {
            foundPoints.push(closestPoint);
          }
        });

        // Sort found points by table order
        let sortedPoints = foundPoints;
        if (lapOrder.length > 0 && foundPoints.length > 1) 
        {
          // Build position map for quick lookup
          const orderMap = new Map<number, number>();
          lapOrder.forEach((lapIndex, position) => 
          {
            orderMap.set(lapIndex, position);
          });

          // Sort by table order
          sortedPoints = [...foundPoints].sort((a, b) => 
          {
            const posA = orderMap.get(a.lapIndex);
            const posB = orderMap.get(b.lapIndex);

            // If positions not found, keep order
            if (posA === undefined || posB === undefined) 
            {
              return a.lapIndex - b.lapIndex;
            }

            return posA - posB;
          });

          if (showHoverDebug && foundPoints.length > 1) 
          {
            const before = foundPoints.map((p) => `Lap${p.lapIndex}`).join(", ");
            const after = sortedPoints.map((p) => `Lap${p.lapIndex}`).join(", ");
            console.log(`[Tooltip Sort] Order: [${lapOrder.join(", ")}]`);
            console.log(`  Before: ${before}`);
            console.log(`  After: ${after}`);
          }
        }

        setHoveredPoints(sortedPoints);
        setDebugHoverData({
          mouseMeters,
          searchRadius: searchRadiusMeters,
          minDistance: minDistanceMeters,
          checkedSegments,
        });

        // Send distance for sync with charts
        if (sortedPoints.length > 0 && onProjectionDistanceChange) 
        {
          // Use distance from first found point (all at same distance)
          onProjectionDistanceChange(sortedPoints[0].distance);
        }
        else if (onProjectionDistanceChange) 
        {
          onProjectionDistanceChange(null);
        }

        // Debug: show conversion only when debug mode is on
        if (showHoverDebug && checkedSegments.length > 0) 
        {
          console.log(
            `[Hover] metersPerPixel: ${metersPerPixel.toFixed(4)}m, minDistance: ${minDistanceMeters.toFixed(2)}m (${minDistancePixels}px)`,
          );
          console.log(
            `[Hover] Checked segments: ${checkedSegments.length}, in range: ${checkedSegments.filter((s) => s.inRange).length}`,
          );
        }
      }
    },
    [
      isDragging,
      dragStart.x,
      dragStart.y,
      viewState,
      baseParams,
      data,
      showHoverDebug,
      updateCounter,
      lapOrder,
      onProjectionDistanceChange,
    ],
  );

  // Compute hoveredPoints from projectionDistance from charts
  useEffect(() => 
  {
    if (projectionDistance !== null && projectionDistance >= 0 && baseParams) 
    {
      // Check if projectionDistance differs from current local hover
      const currentDistance = hoveredPoints.length > 0 ? hoveredPoints[0].distance : null;
      // If local hover has same distance, don't update
      if (
        mousePos !== null &&
        currentDistance !== null &&
        Math.abs(currentDistance - projectionDistance) < 1
      ) 
      {
        return;
      }
      const fastestLapIndex = data.getFastestVisibleLap();
      const projectedPoints: TrackPoint[] = [];

      data.laps.forEach((lap) => 
      {
        if (!lap.visible) return;

        // Find point at target distance (take nearest)
        let closestRow = null;
        let minDiff = Infinity;

        for (const row of lap.rows) 
        {
          if (row.lapDistanceFromStart !== undefined) 
          {
            const diff = Math.abs(row.lapDistanceFromStart - projectionDistance);
            if (diff < minDiff) 
            {
              minDiff = diff;
              closestRow = row;
            }
          }
        }

        if (!closestRow || minDiff > 50) return; // Too far

        // Convert to screen coords
        const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale;
        const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale;

        const localX = toLocalX(closestRow.long);
        const localY = toLocalY(closestRow.lat);
        const screenX = localX * viewState.scale + viewState.offsetX;
        const screenY = localY * viewState.scale + viewState.offsetY;

        projectedPoints.push({
          lapIndex: lap.index,
          lapColor: lap.color,
          lapName: `Lap ${lap.index + 1}`,
          distance: closestRow.lapDistanceFromStart || 0,
          time: `${((closestRow.lapTimeFromStart || 0) / 1000).toFixed(3)}s`,
          timeMs: closestRow.lapTimeFromStart || 0,
          velocity: closestRow.velocity,
          x: screenX,
          y: screenY,
          isFastest: lap.index === fastestLapIndex,
        });
      });

      // Sort by table order
      if (lapOrder.length > 0 && projectedPoints.length > 1) 
      {
        const orderMap = new Map<number, number>();
        lapOrder.forEach((lapIndex, position) => 
        {
          orderMap.set(lapIndex, position);
        });

        projectedPoints.sort((a, b) => 
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

      setHoveredPoints(projectedPoints);
    }
    else if (projectionDistance === null) 
    {
      // Clear when projectionDistance becomes null
      setHoveredPoints([]);
    }
  }, [projectionDistance, data, baseParams, viewState, lapOrder, mousePos]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseLeave = useCallback(() => 
  {
    setIsDragging(false);
    setMousePos(null);
    setDebugHoverData(null);
    // Don't clear hoveredPoints here - they may come from projectionDistance
  }, []);

  const toggleTileBorders = () => 
  {
    setShowTileBorders((prev) => !prev);
  };

  const toggleTileLabels = () => 
  {
    setShowTileLabels((prev) => !prev);
  };

  const toggleStartFinishDebug = () => 
  {
    setShowStartFinishDebug((prev) => !prev);
  };

  const toggleHoverDebug = () => 
  {
    setShowHoverDebug((prev) => !prev);
  };

  useEffect(() => 
  {
    const canvas = canvasRef.current;
    if (!canvas || data.rows.length === 0 || !baseParams) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Cancel previous frame if any
    if (animationFrameRef.current !== null) 
    {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Use requestAnimationFrame for optimization
    animationFrameRef.current = requestAnimationFrame(() => 
    {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const bbox = data.boundingBox;
      ctx.save();
      ctx.translate(viewState.offsetX, viewState.offsetY);
      ctx.scale(viewState.scale, viewState.scale);

      const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale;
      const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale;

      // Draw tiles
      if (tiles.size > 0) 
      {
        tiles.forEach((img, key) => 
        {
          const [z, x, y] = key.split("/").map(Number);
          const topLeft = tileToLatLng(x, y, z);
          const bottomRight = tileToLatLng(x + 1, y + 1, z);

          const localX = toLocalX(topLeft.lng);
          const localY = toLocalY(topLeft.lat);
          const width = (bottomRight.lng - topLeft.lng) * baseParams.baseScale;
          const height = -(bottomRight.lat - topLeft.lat) * baseParams.baseScale;

          ctx.drawImage(img, localX, localY, width, height);

          // Tile borders
          if (showTileBorders) 
          {
            ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
            ctx.lineWidth = 2 / viewState.scale;
            ctx.strokeRect(localX, localY, width, height);
          }

          // Tile labels
          if (showTileLabels) 
          {
            ctx.save();
            ctx.resetTransform();
            const screenX = localX * viewState.scale + viewState.offsetX;
            const screenY = localY * viewState.scale + viewState.offsetY;
            ctx.fillStyle = "rgba(255, 255, 0, 0.9)";
            ctx.font = "bold 12px monospace";
            ctx.fillText(`${x},${y}`, screenX + 5, screenY + 15);
            ctx.restore();
            ctx.translate(viewState.offsetX, viewState.offsetY);
            ctx.scale(viewState.scale, viewState.scale);
          }
        });
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1 / viewState.scale;
      ctx.strokeRect(
        toLocalX(bbox.minLong),
        toLocalY(bbox.maxLat),
        (bbox.maxLong - bbox.minLong) * baseParams.baseScale,
        (bbox.maxLat - bbox.minLat) * baseParams.baseScale,
      );

      // Draw start-finish line (BEFORE laps so it's underneath)
      if (data.startFinish) 
      {
        const sf = data.startFinish;

        // Checkered strip - two rows in alternating pattern
        const squareCount = 10;
        const squareWidthMeters = sf.width / squareCount; // square width in meters
        const rowCount = 2;
        const rowHeightMeters = 4; // row height in meters

        for (let row = 0; row < rowCount; row++) 
        {
          for (let i = 0; i < squareCount; i++) 
          {
            // Square position along line
            const alongLineStart = (i - squareCount / 2) * squareWidthMeters;
            const alongLineEnd = (i + 1 - squareCount / 2) * squareWidthMeters;
            const perpDistStart = row * rowHeightMeters;
            const perpDistEnd = (row + 1) * rowHeightMeters;

            // 4 corners of square in meters
            const corner1X_m =
              sf.pointMeters.x +
              sf.perpendicular.x * alongLineStart +
              sf.direction.x * perpDistStart;
            const corner1Y_m =
              sf.pointMeters.y +
              sf.perpendicular.y * alongLineStart +
              sf.direction.y * perpDistStart;
            const corner2X_m =
              sf.pointMeters.x + sf.perpendicular.x * alongLineEnd + sf.direction.x * perpDistStart;
            const corner2Y_m =
              sf.pointMeters.y + sf.perpendicular.y * alongLineEnd + sf.direction.y * perpDistStart;
            const corner3X_m =
              sf.pointMeters.x + sf.perpendicular.x * alongLineEnd + sf.direction.x * perpDistEnd;
            const corner3Y_m =
              sf.pointMeters.y + sf.perpendicular.y * alongLineEnd + sf.direction.y * perpDistEnd;
            const corner4X_m =
              sf.pointMeters.x + sf.perpendicular.x * alongLineStart + sf.direction.x * perpDistEnd;
            const corner4Y_m =
              sf.pointMeters.y + sf.perpendicular.y * alongLineStart + sf.direction.y * perpDistEnd;

            // Convert to GPS
            const c1 = metersToGps(corner1X_m, corner1Y_m, bbox.minLat, bbox.minLong);
            const c2 = metersToGps(corner2X_m, corner2Y_m, bbox.minLat, bbox.minLong);
            const c3 = metersToGps(corner3X_m, corner3Y_m, bbox.minLat, bbox.minLong);
            const c4 = metersToGps(corner4X_m, corner4Y_m, bbox.minLat, bbox.minLong);

            // Checkerboard - less contrast
            const isOrange = (i + row) % 2 === 0;
            ctx.fillStyle = isOrange ? "#FF6B00" : "#2a2a2a";
            ctx.strokeStyle = "rgba(255, 107, 0, 0.5)";
            ctx.lineWidth = 1 / viewState.scale;

            ctx.beginPath();
            ctx.moveTo(toLocalX(c1.long), toLocalY(c1.lat));
            ctx.lineTo(toLocalX(c2.long), toLocalY(c2.lat));
            ctx.lineTo(toLocalX(c3.long), toLocalY(c3.lat));
            ctx.lineTo(toLocalX(c4.long), toLocalY(c4.lat));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      }

      // Draw laps in different colors (ABOVE start-finish line)
      ctx.lineWidth = 3 / viewState.scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Disable bright glow
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      // Draw visible laps
      data.laps.forEach((lap) => 
      {
        // Check if this lap is visible
        if (!lap.visible) return;

        ctx.strokeStyle = lap.color;
        ctx.beginPath();
        const firstRow = lap.rows[0];
        ctx.moveTo(toLocalX(firstRow.long), toLocalY(firstRow.lat));
        for (let i = 1; i < lap.rows.length; i++) 
        {
          const row = lap.rows[i];
          ctx.lineTo(toLocalX(row.long), toLocalY(row.lat));
        }
        ctx.stroke();
      });

      ctx.shadowColor = "transparent";

      // Debug visualization of start-finish line for lap detection
      if (showStartFinishDebug && data.startFinish) 
      {
        const sf = data.startFinish;
        const sfX = toLocalX(sf.point.long);
        const sfY = toLocalY(sf.point.lat);

        // Compute two points of detection segment exactly as in algorithm (in meters)
        const halfWidth = sf.width / 2;
        const detectionX1_m = sf.pointMeters.x - sf.perpendicular.x * halfWidth;
        const detectionY1_m = sf.pointMeters.y - sf.perpendicular.y * halfWidth;
        const detectionX2_m = sf.pointMeters.x + sf.perpendicular.x * halfWidth;
        const detectionY2_m = sf.pointMeters.y + sf.perpendicular.y * halfWidth;

        // Convert back to GPS
        const point1_gps = metersToGps(detectionX1_m, detectionY1_m, bbox.minLat, bbox.minLong);
        const point2_gps = metersToGps(detectionX2_m, detectionY2_m, bbox.minLat, bbox.minLong);

        // Convert to canvas local coords
        const perpX1 = toLocalX(point1_gps.long);
        const perpY1 = toLocalY(point1_gps.lat);
        const perpX2 = toLocalX(point2_gps.long);
        const perpY2 = toLocalY(point2_gps.lat);

        // Draw red thick detection line (end segment)
        ctx.strokeStyle = "rgba(255, 0, 0, 0.9)";
        ctx.lineWidth = 5 / viewState.scale;
        ctx.beginPath();
        ctx.moveTo(perpX1, perpY1);
        ctx.lineTo(perpX2, perpY2);
        ctx.stroke();

        // Draw segment endpoints (green circles)
        ctx.fillStyle = "rgba(0, 255, 0, 0.9)";
        ctx.strokeStyle = "rgba(0, 0, 0, 1)";
        ctx.lineWidth = 2 / viewState.scale;
        const endPointSize = 6 / viewState.scale;

        ctx.beginPath();
        ctx.arc(perpX1, perpY1, endPointSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(perpX2, perpY2, endPointSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Start-finish center point (large red circle)
        ctx.fillStyle = "rgba(255, 0, 0, 0.9)";
        ctx.strokeStyle = "rgba(255, 255, 255, 1)";
        ctx.lineWidth = 2 / viewState.scale;
        const centerSize = 8 / viewState.scale;
        ctx.beginPath();
        ctx.arc(sfX, sfY, centerSize, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Movement direction arrow (blue) - draw in meters
        const arrowLengthMeters = sf.width * 1.5;
        const arrowEndX_m = sf.pointMeters.x + sf.direction.x * arrowLengthMeters;
        const arrowEndY_m = sf.pointMeters.y + sf.direction.y * arrowLengthMeters;
        const arrowEnd_gps = metersToGps(arrowEndX_m, arrowEndY_m, bbox.minLat, bbox.minLong);
        const dirEndX = toLocalX(arrowEnd_gps.long);
        const dirEndY = toLocalY(arrowEnd_gps.lat);
        const arrowHeadSize = 10 / viewState.scale;

        ctx.strokeStyle = "rgba(0, 100, 255, 0.9)";
        ctx.fillStyle = "rgba(0, 100, 255, 0.9)";
        ctx.lineWidth = 3 / viewState.scale;
        ctx.beginPath();
        ctx.moveTo(sfX, sfY);
        ctx.lineTo(dirEndX, dirEndY);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(-sf.direction.y, sf.direction.x);
        ctx.beginPath();
        ctx.moveTo(dirEndX, dirEndY);
        ctx.lineTo(
          dirEndX - arrowHeadSize * Math.cos(angle - Math.PI / 6),
          dirEndY - arrowHeadSize * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          dirEndX - arrowHeadSize * Math.cos(angle + Math.PI / 6),
          dirEndY - arrowHeadSize * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();

        // Draw interpolated points (orange)
        data.laps.forEach((lap) => 
        {
          lap.rows.forEach((row) => 
          {
            if (row.isInterpolated) 
            {
              const x = toLocalX(row.long);
              const y = toLocalY(row.lat);
              ctx.fillStyle = "rgba(255, 165, 0, 0.9)";
              ctx.strokeStyle = "rgba(0, 0, 0, 1)";
              ctx.lineWidth = 2 / viewState.scale;
              const interpSize = 7 / viewState.scale;
              ctx.beginPath();
              ctx.arc(x, y, interpSize, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            }
          });
        });
      }

      const pointSize = 6 / viewState.scale;
      ctx.lineWidth = 2 / viewState.scale;
      ctx.fillStyle = "#00ff00";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.arc(toLocalX(data.rows[0].long), toLocalY(data.rows[0].lat), pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      const last = data.rows[data.rows.length - 1];
      ctx.fillStyle = "#0000ff";
      ctx.beginPath();
      ctx.arc(toLocalX(last.long), toLocalY(last.lat), pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // === DEBUG HOVER DRAWING (only when enabled) ===
      if (showHoverDebug && debugHoverData && mousePos) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        const md = debugHoverData;

        // Convert meters to canvas local coords
        const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale;
        const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale;

        // Convert track meters to GPS, then to local
        const mouseGps = metersToGps(md.mouseMeters.x, md.mouseMeters.y, bbox.minLat, bbox.minLong);
        const mouseLX = toLocalX(mouseGps.long);
        const mouseLY = toLocalY(mouseGps.lat);

        // 1. Cursor crosshair
        ctx.strokeStyle = "#FFFF00";
        ctx.lineWidth = 2 / viewState.scale;
        const crossSize = 15 / viewState.scale;
        ctx.beginPath();
        ctx.moveTo(mouseLX - crossSize, mouseLY);
        ctx.lineTo(mouseLX + crossSize, mouseLY);
        ctx.moveTo(mouseLX, mouseLY - crossSize);
        ctx.lineTo(mouseLX, mouseLY + crossSize);
        ctx.stroke();

        // 2. Search radius circle (x2 of min distance)
        ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
        ctx.lineWidth = 1 / viewState.scale;
        const searchRadiusLocal = md.searchRadius * baseParams.baseScale;
        ctx.beginPath();
        ctx.arc(mouseLX, mouseLY, searchRadiusLocal, 0, 2 * Math.PI);
        ctx.stroke();

        // 3. Min distance circle
        ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
        ctx.lineWidth = 2 / viewState.scale;
        const minDistLocal = md.minDistance * baseParams.baseScale;
        ctx.beginPath();
        ctx.arc(mouseLX, mouseLY, minDistLocal, 0, 2 * Math.PI);
        ctx.stroke();

        // 4. Checked segments and projections
        md.checkedSegments.forEach((seg) => 
        {
          // Convert segment points from meters to local coords
          const p1Gps = metersToGps(seg.p1.x, seg.p1.y, bbox.minLat, bbox.minLong);
          const p2Gps = metersToGps(seg.p2.x, seg.p2.y, bbox.minLat, bbox.minLong);
          const projGps = metersToGps(seg.proj.x, seg.proj.y, bbox.minLat, bbox.minLong);

          const p1LX = toLocalX(p1Gps.long);
          const p1LY = toLocalY(p1Gps.lat);
          const p2LX = toLocalX(p2Gps.long);
          const p2LY = toLocalY(p2Gps.lat);
          const projLX = toLocalX(projGps.long);
          const projLY = toLocalY(projGps.lat);

          // Draw segment (checked part of trajectory)
          ctx.strokeStyle = seg.inRange ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 0, 0, 0.5)";
          ctx.lineWidth = 3 / viewState.scale;
          ctx.beginPath();
          ctx.moveTo(p1LX, p1LY);
          ctx.lineTo(p2LX, p2LY);
          ctx.stroke();

          // Draw projection (line from cursor to projection)
          ctx.strokeStyle = seg.inRange ? "rgba(0, 255, 0, 0.6)" : "rgba(255, 0, 0, 0.4)";
          ctx.lineWidth = 1 / viewState.scale;
          ctx.setLineDash([5 / viewState.scale, 5 / viewState.scale]);
          ctx.beginPath();
          ctx.moveTo(mouseLX, mouseLY);
          ctx.lineTo(projLX, projLY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Projection point
          ctx.fillStyle = seg.inRange ? "#00FF00" : "#FF0000";
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1 / viewState.scale;
          const projSize = 5 / viewState.scale;
          ctx.beginPath();
          ctx.arc(projLX, projLY, projSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();

        // Cursor coords (in screen coords) - fit inside canvas
        ctx.save();

        const inRangeCount = md.checkedSegments.filter((s) => s.inRange).length;
        const panelWidth = 260;
        const panelHeight = 80;

        // Fit panel inside canvas area
        let panelX = mousePos.x + 20;
        let panelY = mousePos.y - panelHeight;

        if (panelX + panelWidth > canvas.width) 
        {
          panelX = mousePos.x - panelWidth - 20;
        }
        if (panelY < 0) 
        {
          panelY = mousePos.y + 20;
        }
        if (panelX < 0) panelX = 10;

        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        ctx.strokeStyle = "#FFFF00";
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

        ctx.font = "11px monospace";
        let yOffset = panelY + 15;

        ctx.fillStyle = "#FFFF00";
        ctx.fillText(
          `Screen: (${mousePos.x.toFixed(0)}, ${mousePos.y.toFixed(0)})`,
          panelX + 5,
          yOffset,
        );
        yOffset += 13;

        ctx.fillStyle = "#00FF00";
        ctx.fillText(
          `Meters: (${md.mouseMeters.x.toFixed(1)}, ${md.mouseMeters.y.toFixed(1)})`,
          panelX + 5,
          yOffset,
        );
        yOffset += 13;

        ctx.fillStyle = "#FF6B00";
        ctx.fillText(`Threshold: ${md.minDistance.toFixed(2)}m (50px)`, panelX + 5, yOffset);
        yOffset += 13;

        ctx.fillStyle = inRangeCount > 0 ? "#00FF00" : "#FF0000";
        ctx.fillText(
          `Segments: ${md.checkedSegments.length} (${inRangeCount} in range)`,
          panelX + 5,
          yOffset,
        );
        yOffset += 13;

        ctx.fillStyle = hoveredPoints.length > 0 ? "#00FF00" : "#FFFFFF";
        ctx.fillText(`Found: ${hoveredPoints.length} points`, panelX + 5, yOffset);

        ctx.restore();
      }

      // Hover points (final found points) - shown from local hover
      const isLocalHover = hoveredPoints.length > 0;
      if (isLocalHover && !showHoverDebug) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        hoveredPoints.forEach((point) => 
        {
          // Convert point screen coords to canvas local
          const localX = (point.x - viewState.offsetX) / viewState.scale;
          const localY = (point.y - viewState.offsetY) / viewState.scale;

          // Draw point on trajectory
          ctx.fillStyle = point.lapColor;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 3 / viewState.scale;
          const hoverPointSize = 8 / viewState.scale;
          ctx.beginPath();
          ctx.arc(localX, localY, hoverPointSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          // Draw circle around point
          ctx.strokeStyle = point.lapColor;
          ctx.lineWidth = 2 / viewState.scale;
          ctx.beginPath();
          ctx.arc(localX, localY, hoverPointSize * 1.8, 0, 2 * Math.PI);
          ctx.stroke();
        });

        ctx.restore();
      }

      // Synced projection from charts (when not local hover)
      if (!isLocalHover && projectionDistance !== null && projectionDistance >= 0) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        // Draw projection points on all visible laps
        data.laps.forEach((lap) => 
        {
          if (!lap.visible) return;

          // Find point at target distance
          const chart = lap.getChart("velocity"); // Any chart to get point
          if (!chart) return;

          // Find row at target distance
          let targetRow = null;
          for (const row of lap.rows) 
          {
            if (
              row.lapDistanceFromStart !== undefined &&
              Math.abs(row.lapDistanceFromStart - projectionDistance) < 10
            ) 
            {
              targetRow = row;
              break;
            }
          }

          if (!targetRow) return;

          const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale;
          const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale;

          const localX = toLocalX(targetRow.long);
          const localY = toLocalY(targetRow.lat);

          // Draw point
          ctx.fillStyle = lap.color;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / viewState.scale;
          const pointSize = 6 / viewState.scale;
          ctx.beginPath();
          ctx.arc(localX, localY, pointSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      }

      ctx.restore();
    });

    return () => 
    {
      if (animationFrameRef.current !== null) 
      {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    data.rows,
    dimensions,
    viewState,
    baseParams,
    tiles,
    showTileBorders,
    showTileLabels,
    showStartFinishDebug,
    showHoverDebug,
    updateCounter,
    hoveredPoints,
    mousePos,
    debugHoverData,
  ]);

  return (
    <div className="track-visualizer" ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="track-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? "grabbing" : "default" }}
      />

      {/* Tooltip with trajectory params - shown only on local hover, not from chart projection */}
      {hoveredPoints.length > 0 &&
        mousePos &&
        (() => 
        {
          // Find reference point (fastest lap)
          const referencePoint = hoveredPoints.find((p) => p.isFastest);

          // Tooltip dimensions (approximate)
          const tooltipWidth = 280;
          const tooltipHeight = 50 + hoveredPoints.length * 75;
          const offset = 15;

          // Position: use mousePos if set, else first point position
          let tooltipX = 0;
          let tooltipY = 0;
          if (mousePos) 
          {
            tooltipX = mousePos.x;
            tooltipY = mousePos.y;
          }
          else if (hoveredPoints.length > 0) 
          {
            // Use first point position (screen coords already computed)
            tooltipX = hoveredPoints[0].x;
            tooltipY = hoveredPoints[0].y;
          }

          // Fit inside canvas area
          let left = tooltipX + offset;
          let top = tooltipY + offset;

          // Clamp to right edge
          if (left + tooltipWidth > dimensions.width) 
          {
            left = tooltipX - tooltipWidth - offset;
          }

          // Clamp to bottom edge
          if (top + tooltipHeight > dimensions.height) 
          {
            top = tooltipY - tooltipHeight - offset;
          }

          // Clamp to left edge
          if (left < 0) 
          {
            left = offset;
          }

          // Clamp to top edge
          if (top < 0) 
          {
            top = offset;
          }

          return (
            <div
              className="track-tooltip"
              style={{
                left: `${left}px`,
                top: `${top}px`,
              }}
            >
              {hoveredPoints.map((point, idx) => 
              {
                // Compute deltas relative to reference point
                let timeDelta = null;
                let speedDelta = null;

                if (referencePoint && !point.isFastest) 
                {
                  // Time delta (seconds)
                  const deltaTimeMs = point.timeMs - referencePoint.timeMs;
                  timeDelta = {
                    value: (deltaTimeMs / 1000).toFixed(3),
                    color: deltaTimeMs < 0 ? "#00ff00" : "#ff6666",
                    sign: deltaTimeMs >= 0 ? "+" : "",
                  };

                  // Velocity delta (km/h)
                  const deltaSpeed = point.velocity - referencePoint.velocity;
                  speedDelta = {
                    value: Math.abs(deltaSpeed).toFixed(1),
                    color: deltaSpeed > 0 ? "#00ff00" : "#ff6666",
                    sign: deltaSpeed >= 0 ? "+" : "-",
                  };
                }

                return (
                  <div key={idx} className="track-tooltip-item">
                    <div className="track-tooltip-header">
                      <span
                        className="track-tooltip-color"
                        style={{ backgroundColor: point.lapColor }}
                      ></span>
                      <span className="track-tooltip-lap">
                        {point.isFastest && "🏁 "}
                        {point.lapName}
                      </span>
                    </div>
                    <div className="track-tooltip-params">
                      <div className="track-tooltip-param">
                        <span className="track-tooltip-label">Time:</span>
                        <span className="track-tooltip-value">{point.time}</span>
                        {timeDelta && (
                          <span className="track-tooltip-delta" style={{ color: timeDelta.color }}>
                            {timeDelta.sign}
                            {timeDelta.value}
                          </span>
                        )}
                      </div>
                      <div className="track-tooltip-param">
                        <span className="track-tooltip-label">Speed:</span>
                        <span className="track-tooltip-value">
                          {point.velocity.toFixed(1)} km/h
                        </span>
                        {speedDelta && (
                          <span className="track-tooltip-delta" style={{ color: speedDelta.color }}>
                            {speedDelta.sign}
                            {speedDelta.value}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {showSettingsPanel && (
        <div className="debug-panel settings-panel">
          <div className="debug-panel-header">
            <h3>Settings</h3>
          </div>
          <div className="debug-panel-content">
            <div className="debug-section">
              <h4>Lap Filtering</h4>
              <div className="setting-item">
                <label className="setting-label">Tolerance: ±{tolerancePercent}% from median</label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={tolerancePercent}
                  onChange={(e) => onToleranceChange?.(parseInt(e.target.value))}
                  className="setting-slider"
                />
              </div>
              <div
                className="debug-line"
                style={{ marginTop: "8px", fontSize: "10px", color: "#888" }}
              >
                Laps with times deviating more than {tolerancePercent}% from median will be filtered
              </div>
            </div>

            <div className="debug-section">
              <h4>Debug</h4>
              <div className="debug-line">Points: {data.rows.length}</div>
              <div className="debug-line">Laps: {data.laps.length}</div>
            </div>

            <div className="debug-section">
              <h4>Tile Settings</h4>
              <label className="debug-checkbox">
                <input type="checkbox" checked={showTileBorders} onChange={toggleTileBorders} />
                <span>Show tile borders</span>
              </label>
              <label className="debug-checkbox">
                <input type="checkbox" checked={showTileLabels} onChange={toggleTileLabels} />
                <span>Show tile labels</span>
              </label>
              <div className="debug-line">Loaded tiles: {tiles.size}</div>
              <div className="debug-line">Cache size: {tileCacheRef.current.size()}</div>
            </div>

            <div className="debug-section">
              <h4>Hover Detection</h4>
              <label className="debug-checkbox">
                <input type="checkbox" checked={showHoverDebug} onChange={toggleHoverDebug} />
                <span>Show hover debug</span>
              </label>
            </div>

            <div className="debug-section">
              <h4>Start/Finish Detection</h4>
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showStartFinishDebug}
                  onChange={toggleStartFinishDebug}
                />
                <span>Show detection line</span>
              </label>
              {data.startFinish && (
                <>
                  <div className="debug-line">
                    Position: ({data.startFinish.pointMeters.x.toFixed(2)},{" "}
                    {data.startFinish.pointMeters.y.toFixed(2)})m
                  </div>
                  <div className="debug-line">
                    Direction: ({data.startFinish.direction.x.toFixed(4)},{" "}
                    {data.startFinish.direction.y.toFixed(4)})
                  </div>
                  <div className="debug-line">
                    Perpendicular: ({data.startFinish.perpendicular.x.toFixed(4)},{" "}
                    {data.startFinish.perpendicular.y.toFixed(4)})
                  </div>
                  <div className="debug-line">Width: {data.startFinish.width}m</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

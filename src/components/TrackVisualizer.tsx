import { useCallback, useEffect, useRef, useState } from "react";
import { VBOData } from "../models/VBOData";
import { CanonicalX, ChartProjectionMode, Projection } from "../models/charts";
import { TileCache, calculateZoom, getTilesForBounds, isTileFullyCovered, latLngToMercator, mercatorToLatLng, tileToLatLng } from "../utils/tiles";
import { gpsToMeters, metersToGps } from "../utils/vboParser";
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
  projection?: Projection; // Chart normalized or track distance
  projectionMode?: ChartProjectionMode; // Convert normalized to distance/time/normalized for track
  onProjectionChange?: (projection: Projection) => void;
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

export type TrajectoryMode = "normal" | "timeDelta" | "speedDelta" | "timeDeltaRate";

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

/** Get interpolated value at normalized position (0..1) from lap rows */
function getValueAtNormalized(
  rows: { lapDistanceFromStart?: number; lapTimeFromStart?: number; velocity?: number }[],
  normalized: number,
  type: "time" | "velocity",
): number 
{
  const lastRow = rows[rows.length - 1];
  const totalDist = lastRow?.lapDistanceFromStart ?? 0;
  if (totalDist <= 0) return 0;
  const targetDist = normalized * totalDist;
  for (let i = 1; i < rows.length; i++) 
  {
    const p1 = rows[i - 1];
    const p2 = rows[i];
    const d1 = p1.lapDistanceFromStart ?? 0;
    const d2 = p2.lapDistanceFromStart ?? 0;
    if (targetDist >= d1 && targetDist <= d2) 
    {
      const t = (d2 - d1) > 0 ? (targetDist - d1) / (d2 - d1) : 0;
      if (type === "time")
        return (p1.lapTimeFromStart ?? 0) + t * ((p2.lapTimeFromStart ?? 0) - (p1.lapTimeFromStart ?? 0));
      return (p1.velocity ?? 0) + t * ((p2.velocity ?? 0) - (p1.velocity ?? 0));
    }
  }
  return type === "time" ? (lastRow?.lapTimeFromStart ?? 0) : (lastRow?.velocity ?? 0);
}

/** Map delta to t in [-1, 1] using dynamic range. minDelta->-1 (best), maxDelta->1 (worst) */
function deltaToT(delta: number, minDelta: number, maxDelta: number): number 
{
  const span = maxDelta - minDelta;
  if (span <= 0) return 0;
  return 2 * (delta - minDelta) / span - 1;
}

/** Interpolate t in [-1, 1] to color: green (t=-1) -> yellow (t=0) -> red -> brown -> black (t=1) */
function tToColor(t: number): string 
{
  const clamped = Math.max(-1, Math.min(1, t));
  if (clamped <= 0)
  {
    const k = 1 + clamped;
    const r = Math.round(255 * (1 - k));
    return `#${r.toString(16).padStart(2, "0")}ff00`;
  }
  const lerp = (a: number, b: number, u: number) => Math.round(a + (b - a) * u);
  const toHex = (r: number, g: number, b: number) =>
    `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  const yellow = { r: 255, g: 255, b: 0 };
  const red = { r: 255, g: 0, b: 0 };
  const brown = { r: 139, g: 69, b: 19 };
  const black = { r: 0, g: 0, b: 0 };
  if (clamped <= 1 / 3)
  {
    const u = clamped * 3;
    return toHex(lerp(yellow.r, red.r, u), lerp(yellow.g, red.g, u), lerp(yellow.b, red.b, u));
  }
  if (clamped <= 2 / 3)
  {
    const u = (clamped - 1 / 3) * 3;
    return toHex(lerp(red.r, brown.r, u), lerp(red.g, brown.g, u), lerp(red.b, brown.b, u));
  }
  const u = (clamped - 2 / 3) * 3;
  return toHex(lerp(brown.r, black.r, u), lerp(brown.g, black.g, u), lerp(brown.b, black.b, u));
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
  projection = null,
  projectionMode = "normalized",
  onProjectionChange,
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
    centerMercX: number;
    centerMercY: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [tiles, setTiles] = useState<Map<string, HTMLImageElement>>(new Map());
  const [baseTileZoom, setBaseTileZoom] = useState(0);
  const [showTileBorders, setShowTileBorders] = useState(false);
  const [showTileLabels, setShowTileLabels] = useState(false);
  const [showStartFinishDebug, setShowStartFinishDebug] = useState(false);
  const [showSectorDebug, setShowSectorDebug] = useState(false);
  const [showHoverDebug, setShowHoverDebug] = useState(false);
  const [trajectoryMode, setTrajectoryMode] = useState<TrajectoryMode>("normal");
  const [deltaBaseWidthMult, setDeltaBaseWidthMult] = useState(1);
  const [deltaMinWidthMult, setDeltaMinWidthMult] = useState(1);
  const [deltaMaxWidthMult, setDeltaMaxWidthMult] = useState(4);
  const tileCacheRef = useRef(new TileCache("google"));

  const [hoveredPoints, setHoveredPoints] = useState<TrackPoint[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Helper: project canonical X onto all laps, return TrackPoint[]
  const projectCanonicalToLaps = useCallback(
    (canonical: CanonicalX, base: typeof baseParams, view: ViewState): TrackPoint[] => 
    {
      if (!base) return [];
      const fastestLapIndex = data.getFastestVisibleLap();
      const points: TrackPoint[] = [];

      data.laps.forEach((lap) => 
      {
        if (!lap.visible) return;
        const rows = lap.rows;
        const lastRow = rows[rows.length - 1];
        const totalDist = lastRow?.lapDistanceFromStart ?? 0;
        const totalTime = lastRow?.lapTimeFromStart ?? 0;

        let targetDist: number;
        let targetTime: number;
        if (projectionMode === "time" && totalTime > 0) 
        {
          targetTime = canonical.timeMs;
          targetDist = 0;
        }
        else 
        {
          targetDist = projectionMode === "normalized" ? canonical.normalized * totalDist : canonical.distance;
          targetTime = 0;
        }

        let found = false;
        let lat = rows[0]?.lat ?? 0;
        let lng = rows[0]?.long ?? 0;
        let dist = 0;
        let timeMs = 0;
        let velocity = 0;

        if (projectionMode === "time" && totalTime > 0) 
        {
          for (let i = 1; i < rows.length; i++) 
          {
            const p1 = rows[i - 1];
            const p2 = rows[i];
            const t1 = p1.lapTimeFromStart ?? 0;
            const t2 = p2.lapTimeFromStart ?? 0;
            if (targetTime >= t1 && targetTime <= t2) 
            {
              const t = (t2 - t1) > 0 ? (targetTime - t1) / (t2 - t1) : 0;
              lat = p1.lat + t * (p2.lat - p1.lat);
              lng = p1.long + t * (p2.long - p1.long);
              dist = (p1.lapDistanceFromStart ?? 0) + t * ((p2.lapDistanceFromStart ?? 0) - (p1.lapDistanceFromStart ?? 0));
              timeMs = targetTime;
              velocity = (p1.velocity ?? 0) + t * ((p2.velocity ?? 0) - (p1.velocity ?? 0));
              found = true;
              break;
            }
          }
        }
        else 
        {
          for (let i = 1; i < rows.length; i++) 
          {
            const p1 = rows[i - 1];
            const p2 = rows[i];
            const d1 = p1.lapDistanceFromStart ?? 0;
            const d2 = p2.lapDistanceFromStart ?? 0;
            if (targetDist >= d1 && targetDist <= d2) 
            {
              const t = (d2 - d1) > 0 ? (targetDist - d1) / (d2 - d1) : 0;
              lat = p1.lat + t * (p2.lat - p1.lat);
              lng = p1.long + t * (p2.long - p1.long);
              dist = targetDist;
              timeMs = (p1.lapTimeFromStart ?? 0) + t * ((p2.lapTimeFromStart ?? 0) - (p1.lapTimeFromStart ?? 0));
              velocity = (p1.velocity ?? 0) + t * ((p2.velocity ?? 0) - (p1.velocity ?? 0));
              found = true;
              break;
            }
          }
        }

        if (!found && rows.length > 0) 
        {
          const last = rows[rows.length - 1];
          lat = last.lat;
          lng = last.long;
          dist = last.lapDistanceFromStart ?? 0;
          timeMs = last.lapTimeFromStart ?? 0;
          velocity = last.velocity ?? 0;
        }

        const toLocal = (la: number, ln: number) => 
        {
          const m = latLngToMercator(la, ln);
          return {
            x: (m.x - base.centerMercX) * base.baseScale,
            y: (m.y - base.centerMercY) * base.baseScale,
          };
        };
        const local = toLocal(lat, lng);
        const screenX = local.x * view.scale + view.offsetX;
        const screenY = local.y * view.scale + view.offsetY;

        points.push({
          lapIndex: lap.index,
          lapColor: lap.color,
          lapName: `Lap ${lap.index + 1}`,
          distance: dist,
          time: `${(timeMs / 1000).toFixed(3)}s`,
          timeMs,
          velocity,
          x: screenX,
          y: screenY,
          isFastest: lap.index === fastestLapIndex,
        });
      });

      if (lapOrder.length > 0 && points.length > 1) 
      {
        const orderMap = new Map<number, number>();
        lapOrder.forEach((lapIndex, position) => orderMap.set(lapIndex, position));
        points.sort((a, b) => (orderMap.get(a.lapIndex) ?? a.lapIndex) - (orderMap.get(b.lapIndex) ?? b.lapIndex));
      }
      return points;
    },
    [data, projectionMode, lapOrder],
  );
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

  // Refs for mouse position and hover updates (to avoid state updates on every mouse move)
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const hoverUpdateFrameRef = useRef<number | null>(null);
  const lastHoveredPointsRef = useRef<TrackPoint[]>([]);
  const onProjectionChangeRef = useRef(onProjectionChange);
  const projectionRef = useRef(projection);
  
  // Keep refs updated
  useEffect(() => 
  {
    onProjectionChangeRef.current = onProjectionChange;
  }, [onProjectionChange]);
  
  useEffect(() => 
  {
    projectionRef.current = projection;
  }, [projection]);

  const viewStateRef = useRef(viewState);
  const baseParamsRef = useRef(baseParams);
  useEffect(() => 
  {
    viewStateRef.current = viewState;
    baseParamsRef.current = baseParams;
  }, [viewState, baseParams]);

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

      const topLeft = latLngToMercator(bbox.maxLat, bbox.minLong);
      const bottomRight = latLngToMercator(bbox.minLat, bbox.maxLong);
      const widthMerc = bottomRight.x - topLeft.x;
      const heightMerc = bottomRight.y - topLeft.y;

      const scaleX = availableWidth / widthMerc;
      const scaleY = availableHeight / heightMerc;
      const baseScale = Math.min(scaleX, scaleY);

      const center = latLngToMercator(bbox.centerLat, bbox.centerLong);
      
      const zoom = calculateZoom(
        bbox.minLat,
        bbox.maxLat,
        bbox.minLong,
        bbox.maxLong,
        dimensions.width,
        dimensions.height,
      );

      setBaseTileZoom(zoom);
      setBaseParams({ baseScale, centerMercX: center.x, centerMercY: center.y });
      
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
    if (!showTiles) 
    {
      setTiles(new Map());
      return;
    }
    if (!baseTileZoom || !data.rows.length || !baseParams) 
    {
      return;
    }

    let cancelled = false;
    const bbox = data.boundingBox;
    const { centerMercX, centerMercY, baseScale } = baseParams;

    const zoomDelta = Math.floor(Math.log2(Math.max(0.5, viewState.scale)));
    const effectiveZoom = Math.max(1, Math.min(21, baseTileZoom + zoomDelta));

    const getBounds = () => 
    {
      if (viewState.scale > 1.2) 
      {
        const minLocalX = -viewState.offsetX / viewState.scale;
        const maxLocalX = (dimensions.width - viewState.offsetX) / viewState.scale;
        const minLocalY = -viewState.offsetY / viewState.scale;
        const maxLocalY = (dimensions.height - viewState.offsetY) / viewState.scale;
        const minMercX = minLocalX / baseScale + centerMercX;
        const maxMercX = maxLocalX / baseScale + centerMercX;
        const minMercY = minLocalY / baseScale + centerMercY;
        const maxMercY = maxLocalY / baseScale + centerMercY;
        const minLl = mercatorToLatLng(minMercX, minMercY);
        const maxLl = mercatorToLatLng(maxMercX, maxMercY);
        return {
          minLat: Math.max(bbox.minLat, Math.min(minLl.lat, maxLl.lat)),
          maxLat: Math.min(bbox.maxLat, Math.max(minLl.lat, maxLl.lat)),
          minLong: Math.max(bbox.minLong, Math.min(minLl.lng, maxLl.lng)),
          maxLong: Math.min(bbox.maxLong, Math.max(minLl.lng, maxLl.lng)),
        };
      }
      return {
        minLat: bbox.minLat,
        maxLat: bbox.maxLat,
        minLong: bbox.minLong,
        maxLong: bbox.maxLong,
      };
    };

    const expandFactor = viewState.scale > 1.2 ? 1.5 : 1.6;
    const cache = tileCacheRef.current;
    const minZoom = Math.min(baseTileZoom, effectiveZoom);
    const maxZoom = Math.max(baseTileZoom, effectiveZoom);

    const loadTiles = async () => 
    {
      for (let z = minZoom; z <= maxZoom && !cancelled; z++) 
      {
        const { minLat, maxLat, minLong, maxLong } = getBounds();
        const tilesToLoad = getTilesForBounds(minLat, maxLat, minLong, maxLong, z, expandFactor);

        for (const tile of tilesToLoad) 
        {
          if (cancelled) break;
          const key = `${tile.z}/${tile.x}/${tile.y}`;
          try 
          {
            const img = await cache.load(tile);
            if (!cancelled) 
            {
              setTiles((prev) => 
              {
                const next = new Map(prev);
                next.set(key, img);
                return next;
              });
            }
          }
          catch 
          {
            // Ignore individual tile load errors
          }
        }
      }
    };

    loadTiles();

    return () => 
    {
      cancelled = true;
    };
  }, [baseTileZoom, baseParams, data.boundingBox, showTiles, viewState.scale, viewState.offsetX, viewState.offsetY, dimensions.width, dimensions.height]);

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

  // Unified function to update hover state (called via requestAnimationFrame)
  const updateHoverState = useCallback(
    (mouseX: number, mouseY: number, currentViewState: ViewState, currentBaseParams: typeof baseParams) => 
    {
      if (!currentBaseParams || !data) return;

      // Update mouse position ref (no state update)
      mousePosRef.current = { x: mouseX, y: mouseY };

      // Convert screen coords to world coords (canvas local coords)
      const worldX = (mouseX - currentViewState.offsetX) / currentViewState.scale;
      const worldY = (mouseY - currentViewState.offsetY) / currentViewState.scale;

      // Convert world coords (Mercator) to GPS
      const mercX = worldX / currentBaseParams.baseScale + currentBaseParams.centerMercX;
      const mercY = worldY / currentBaseParams.baseScale + currentBaseParams.centerMercY;
      const mouseGps = mercatorToLatLng(mercX, mercY);
      const mouseLat = mouseGps.lat;
      const mouseLong = mouseGps.lng;

      // Convert GPS to track metric coords (same as VBODataRow.x, VBODataRow.y)
      const bbox = data.boundingBox;
      const mouseMeters = gpsToMeters(mouseLat, mouseLong, bbox.minLat, bbox.minLong);

      // Convert pixels to meters (Mercator: 1 local unit = 1/baseScale Mercator units; 1 Mercator unit ≈ 40075 km at equator)
      const metersPerLocalUnit =
        (40075000 * Math.cos((bbox.centerLat * Math.PI) / 180)) / currentBaseParams.baseScale;
      const metersPerPixel = metersPerLocalUnit / currentViewState.scale;

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

      // Find nearest point on FASTEST lap only - this gives us canonical X
      const fastestLapIndex = data.getFastestVisibleLap();
      const fastestLap = fastestLapIndex !== null ? data.laps.find((l) => l.index === fastestLapIndex) : null;

      let canonical: CanonicalX | null = null;
      const foundPoints: TrackPoint[] = [];

      if (fastestLap?.visible) 
      {
        type Candidate = { dist: number; distanceFromStart: number; timeFromStart: number; normalized: number };
        const candidates: Candidate[] = [];
        const rows = fastestLap.rows;
        const lastRow = rows[rows.length - 1];
        const totalDist = lastRow?.lapDistanceFromStart ?? 0;

        for (let i = 1; i < rows.length; i++) 
        {
          const p1 = rows[i - 1];
          const p2 = rows[i];
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
            continue;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const segmentLength = Math.sqrt(dx * dx + dy * dy);
          if (segmentLength < 0.001) continue;

          const t = Math.max(
            0,
            Math.min(
              1,
              ((mouseMeters.x - p1.x) * dx + (mouseMeters.y - p1.y) * dy) / (segmentLength * segmentLength),
            ),
          );
          const projX = p1.x + t * dx;
          const projY = p1.y + t * dy;
          const dist = Math.sqrt(
            (mouseMeters.x - projX) ** 2 + (mouseMeters.y - projY) ** 2,
          );

          checkedSegments.push({
            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            proj: { x: projX, y: projY },
            dist,
            inRange: dist < minDistanceMeters,
          });

          if (dist < minDistanceMeters) 
          {
            const p1Dist = p1.lapDistanceFromStart ?? 0;
            const p2Dist = p2.lapDistanceFromStart ?? 0;
            const p1Time = p1.lapTimeFromStart ?? 0;
            const p2Time = p2.lapTimeFromStart ?? 0;
            candidates.push({
              dist,
              distanceFromStart: p1Dist + t * (p2Dist - p1Dist),
              timeFromStart: p1Time + t * (p2Time - p1Time),
              normalized: totalDist > 0 ? (p1Dist + t * (p2Dist - p1Dist)) / totalDist : 0,
            });
          }
        }

        if (candidates.length > 0) 
        {
          const best = candidates.reduce((a, b) => (a.dist <= b.dist ? a : b));
          canonical = {
            distance: best.distanceFromStart,
            timeMs: best.timeFromStart,
            normalized: best.normalized,
          };
        }
      }

      if (canonical) 
      {
        const projectedPoints = projectCanonicalToLaps(canonical, currentBaseParams, currentViewState);
        foundPoints.push(...projectedPoints);
      }

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

      // Always update on every cursor move for smooth projection
      lastHoveredPointsRef.current = sortedPoints;
      setHoveredPoints(sortedPoints);
      setMousePos({ x: mouseX, y: mouseY });
      setDebugHoverData({
        mouseMeters,
        searchRadius: searchRadiusMeters,
        minDistance: minDistanceMeters,
        checkedSegments,
      });

      if (onProjectionChangeRef.current && canonical) 
      {
        onProjectionChangeRef.current({ type: "track", canonical });
      }
      else if (onProjectionChangeRef.current && !canonical && sortedPoints.length === 0) 
      {
        onProjectionChangeRef.current(null);
      }

      if (showHoverDebug && checkedSegments.length > 0) 
      {
        console.log(
          `[Hover] metersPerPixel: ${metersPerPixel.toFixed(4)}m, minDistance: ${minDistanceMeters.toFixed(2)}m (${minDistancePixels}px)`,
        );
        console.log(
          `[Hover] Checked segments: ${checkedSegments.length}, in range: ${checkedSegments.filter((s) => s.inRange).length}`,
        );
      }
    },
    [data, showHoverDebug, lapOrder, projectCanonicalToLaps],
    // onProjectionDistanceChange removed from dependencies - using ref instead
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
      // Hover is handled by native mousemove listener for 1-pixel resolution
    },
    [isDragging, dragStart.x, dragStart.y],
  );

  // Native mousemove for 1-pixel updates (React synthetic events can be throttled)
  useEffect(() => 
  {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handler = (e: MouseEvent) => 
    {
      if (baseParamsRef.current) 
      {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        updateHoverState(mouseX, mouseY, viewStateRef.current, baseParamsRef.current);
      }
    };

    canvas.addEventListener("mousemove", handler, { passive: true });
    return () => canvas.removeEventListener("mousemove", handler);
  }, [updateHoverState]);

  // Compute hoveredPoints from chart projection
  // Convert normalized (0..1) to projection mode per lap: distance, time, or normalized
  const hoveredPointsRef = useRef<TrackPoint[]>([]);
  useEffect(() => 
  {
    hoveredPointsRef.current = hoveredPoints;
  }, [hoveredPoints]);

  useEffect(() => 
  {
    // Process both chart and track projection - get canonical X and project onto all laps
    // Recomputes screen coords when viewState (zoom/pan) changes so projection stays on trajectory
    if (projection && baseParams) 
    {
      let canonical: CanonicalX;
      if (projection.type === "chart") 
      {
        const refLap = data.getFastestVisibleLap() !== null
          ? data.laps.find((l) => l.index === data.getFastestVisibleLap())
          : null;
        const refLastRow = refLap?.rows[refLap.rows.length - 1];
        const refTotalDist = refLastRow?.lapDistanceFromStart ?? 0;
        const refTotalTime = refLastRow?.lapTimeFromStart ?? 0;
        const n = projection.normalized;
        canonical = {
          distance: n * refTotalDist,
          timeMs: n * refTotalTime,
          normalized: n,
        };
      }
      else 
      {
        canonical = projection.canonical;
      }

      const projectedPoints = projectCanonicalToLaps(canonical, baseParams, viewState);

      const needsUpdate =
        hoveredPointsRef.current.length !== projectedPoints.length ||
        hoveredPointsRef.current.some((a, i) => 
        {
          const b = projectedPoints[i];
          return !b || a.lapIndex !== b.lapIndex || Math.abs(a.distance - b.distance) > 0.01 || Math.abs(a.x - b.x) > 0.1 || Math.abs(a.y - b.y) > 0.1;
        });

      if (needsUpdate) 
      {
        lastHoveredPointsRef.current = projectedPoints;
        setHoveredPoints(projectedPoints);
        if (projection.type === "chart") setMousePos(null); // Chart projection: no local tooltip
      }
    }
    else if (projection === null) 
    {
      if (mousePosRef.current !== null) return;
      if (hoveredPointsRef.current.length > 0) 
      {
        lastHoveredPointsRef.current = [];
        setHoveredPoints([]);
      }
    }
  }, [projection, projectionMode, data, baseParams, viewState, lapOrder]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseLeave = useCallback(() => 
  {
    setIsDragging(false);
    mousePosRef.current = null;
    setMousePos(null);
    setDebugHoverData(null);
    // Cancel pending hover update
    if (hoverUpdateFrameRef.current !== null) 
    {
      cancelAnimationFrame(hoverUpdateFrameRef.current);
      hoverUpdateFrameRef.current = null;
    }
    // Clear local hover points when mouse leaves track area
    if (projectionRef.current?.type !== "chart" && hoveredPointsRef.current.length > 0) 
    {
      lastHoveredPointsRef.current = [];
      setHoveredPoints([]);
    }
    // Clear projection if it was set from track hover
    if (onProjectionChangeRef.current && projectionRef.current?.type === "track") 
    {
      onProjectionChangeRef.current(null);
    }
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

  const toggleSectorDebug = () => 
  {
    setShowSectorDebug((prev) => !prev);
  };

  const toggleHoverDebug = () => 
  {
    setShowHoverDebug((prev) => !prev);
  };

  const cycleTrajectoryMode = () => 
  {
    setTrajectoryMode((prev) => 
    {
      if (prev === "normal") return "timeDelta";
      if (prev === "timeDelta") return "speedDelta";
      if (prev === "speedDelta") return "timeDeltaRate";
      return "normal";
    });
  };

  // Use refs for frequently changing values to avoid re-renders
  const hoveredPointsForRenderRef = useRef<TrackPoint[]>([]);
  const mousePosForRenderRef = useRef<{ x: number; y: number } | null>(null);
  const debugHoverDataForRenderRef = useRef<typeof debugHoverData>(null);

  useEffect(() => 
  {
    hoveredPointsForRenderRef.current = hoveredPoints;
  }, [hoveredPoints]);

  useEffect(() => 
  {
    mousePosForRenderRef.current = mousePos;
  }, [mousePos]);

  useEffect(() => 
  {
    debugHoverDataForRenderRef.current = debugHoverData;
  }, [debugHoverData]);

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
      // Use refs for current values to avoid dependency on frequently changing state
      const currentHoveredPoints = hoveredPointsForRenderRef.current;
      const currentMousePos = mousePosForRenderRef.current;
      const currentDebugHoverData = debugHoverDataForRenderRef.current;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const bbox = data.boundingBox;
      ctx.save();
      ctx.translate(viewState.offsetX, viewState.offsetY);
      ctx.scale(viewState.scale, viewState.scale);

      const toLocal = (lat: number, lng: number) => 
      {
        const m = latLngToMercator(lat, lng);
        return {
          x: (m.x - baseParams.centerMercX) * baseParams.baseScale,
          y: (m.y - baseParams.centerMercY) * baseParams.baseScale,
        };
      };

      // Draw tiles: low zoom first, high zoom on top. Skip low-res if fully covered by high-res.
      // Only draw up to effectiveZoom (optimal detail for current scale).
      if (tiles.size > 0) 
      {
        const zoomDelta = Math.floor(Math.log2(Math.max(0.5, viewState.scale)));
        const effectiveZoom = Math.max(1, Math.min(21, baseTileZoom + zoomDelta));

        const minLocalX = -viewState.offsetX / viewState.scale;
        const maxLocalX = (dimensions.width - viewState.offsetX) / viewState.scale;
        const minLocalY = -viewState.offsetY / viewState.scale;
        const maxLocalY = (dimensions.height - viewState.offsetY) / viewState.scale;

        const sortedKeys = Array.from(tiles.keys()).sort((a, b) => 
        {
          const za = parseInt(a.split("/")[0], 10);
          const zb = parseInt(b.split("/")[0], 10);
          return za - zb;
        });

        for (const key of sortedKeys) 
        {
          const [z, x, y] = key.split("/").map(Number);
          if (z > effectiveZoom) continue;
          if (isTileFullyCovered(x, y, z, tiles, effectiveZoom)) continue;

          const img = tiles.get(key);
          if (!img?.complete) continue;

          const topLeft = tileToLatLng(x, y, z);
          const bottomRight = tileToLatLng(x + 1, y + 1, z);
          const m1 = latLngToMercator(topLeft.lat, topLeft.lng);
          const m2 = latLngToMercator(bottomRight.lat, bottomRight.lng);

          const tl = toLocal(topLeft.lat, topLeft.lng);
          const localX = tl.x;
          const localY = tl.y;
          const width = (m2.x - m1.x) * baseParams.baseScale;
          const height = (m2.y - m1.y) * baseParams.baseScale;

          if (localX + width <= minLocalX || localX >= maxLocalX || localY + height <= minLocalY || localY >= maxLocalY) continue;

          ctx.drawImage(img, localX, localY, width, height);

          // Tile borders
          if (showTileBorders) 
          {
            ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
            ctx.lineWidth = 2 / viewState.scale;
            ctx.strokeRect(localX, localY, width, height);
          }

          // Tile labels (screen coords - reset transform, draw, restore)
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
          }
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1 / viewState.scale;
      const bboxTl = toLocal(bbox.maxLat, bbox.minLong);
      const bboxMercTl = latLngToMercator(bbox.maxLat, bbox.minLong);
      const bboxMercBr = latLngToMercator(bbox.minLat, bbox.maxLong);
      ctx.strokeRect(
        bboxTl.x,
        bboxTl.y,
        (bboxMercBr.x - bboxMercTl.x) * baseParams.baseScale,
        (bboxMercBr.y - bboxMercTl.y) * baseParams.baseScale,
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
            ctx.moveTo(toLocal(c1.lat, c1.long).x, toLocal(c1.lat, c1.long).y);
            ctx.lineTo(toLocal(c2.lat, c2.long).x, toLocal(c2.lat, c2.long).y);
            ctx.lineTo(toLocal(c3.lat, c3.long).x, toLocal(c3.lat, c3.long).y);
            ctx.lineTo(toLocal(c4.lat, c4.long).x, toLocal(c4.lat, c4.long).y);
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
      const hasSectors = (data.trackData?.sectors?.length ?? 0) > 0;
      const fastestLapIdx = data.getFastestVisibleLap();
      const fastestLap = fastestLapIdx !== null ? data.laps.find((l) => l.index === fastestLapIdx) : null;
      const fastestRows = fastestLap?.visible ? fastestLap.rows : [];

      const lapsToDraw =
        (trajectoryMode === "timeDelta" || trajectoryMode === "speedDelta" || trajectoryMode === "timeDeltaRate") && fastestLapIdx !== null
          ? [
              ...data.laps.filter((l) => l.visible && l.index === fastestLapIdx),
              ...data.laps.filter((l) => l.visible && l.index !== fastestLapIdx),
            ]
          : data.laps.filter((l) => l.visible);

      lapsToDraw.forEach((lap) => 
      {
        const baseColor = lap.color;
        const darkColor = darkenColor(baseColor);
        const rows = lap.rows;
        const lastRow = rows[rows.length - 1];
        const totalDist = lastRow?.lapDistanceFromStart ?? 0;

        const baseLineWidth = 3 / viewState.scale;

        if (trajectoryMode === "normal") 
        {
          if (!hasSectors) 
          {
            ctx.strokeStyle = baseColor;
            ctx.beginPath();
            const firstRow = rows[0];
            ctx.moveTo(toLocal(firstRow.lat, firstRow.long).x, toLocal(firstRow.lat, firstRow.long).y);
            for (let i = 1; i < rows.length; i++) 
            {
              const row = rows[i];
              ctx.lineTo(toLocal(row.lat, row.long).x, toLocal(row.lat, row.long).y);
            }
            ctx.stroke();
            return;
          }
          let currentSector = 0;
          let strokeColor = (currentSector & 1) === 0 ? darkColor : baseColor;
          ctx.strokeStyle = strokeColor;
          ctx.beginPath();
          const firstRow = rows[0];
          ctx.moveTo(toLocal(firstRow.lat, firstRow.long).x, toLocal(firstRow.lat, firstRow.long).y);
          for (let i = 1; i < rows.length; i++) 
          {
            const row = rows[i];
            const sb = row.sectorBoundaryIndex;
            if (sb !== undefined) 
            {
              ctx.lineTo(toLocal(row.lat, row.long).x, toLocal(row.lat, row.long).y);
              ctx.stroke();
              currentSector = sb + 1;
              strokeColor = (currentSector & 1) === 0 ? darkColor : baseColor;
              ctx.strokeStyle = strokeColor;
              ctx.beginPath();
              ctx.moveTo(toLocal(row.lat, row.long).x, toLocal(row.lat, row.long).y);
            }
            else 
            {
              ctx.lineTo(toLocal(row.lat, row.long).x, toLocal(row.lat, row.long).y);
            }
          }
          ctx.stroke();
          return;
        }

        const isDeltaMode = trajectoryMode === "timeDelta" || trajectoryMode === "speedDelta" || trajectoryMode === "timeDeltaRate";
        if (isDeltaMode && fastestRows.length > 0 && totalDist > 0) 
        {
          ctx.save();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const colorType = trajectoryMode === "timeDelta" ? "time" : trajectoryMode === "speedDelta" ? "speed" : "timeDeltaRate";
          const widthType = trajectoryMode === "timeDelta" ? "time" : trajectoryMode === "speedDelta" ? "speed" : "timeDeltaRate";
          const { base: baseMult, min: minMult, max: maxMult } = {
            base: deltaBaseWidthMult,
            min: deltaMinWidthMult,
            max: deltaMaxWidthMult,
          };

          if (lap.index === fastestLapIdx) 
          {
            ctx.strokeStyle = "#0066ff";
            ctx.lineWidth = baseLineWidth * baseMult;
            ctx.beginPath();
            const first = rows[0];
            ctx.moveTo(toLocal(first.lat, first.long).x, toLocal(first.lat, first.long).y);
            for (let i = 1; i < rows.length; i++) 
            {
              const r = rows[i];
              ctx.lineTo(toLocal(r.lat, r.long).x, toLocal(r.lat, r.long).y);
            }
            ctx.stroke();
            ctx.restore();
            return;
          }

          const timeDeltas: number[] = [];
          const speedDeltas: number[] = [];
          const speedDeltasPercent: number[] = [];
          for (let i = 1; i < rows.length; i++) 
          {
            const p1 = rows[i - 1];
            const p2 = rows[i];
            const d1 = p1.lapDistanceFromStart ?? 0;
            const d2 = p2.lapDistanceFromStart ?? 0;
            const norm = ((d1 + d2) / 2) / totalDist;
            const refTime = getValueAtNormalized(fastestRows, norm, "time");
            const refVel = getValueAtNormalized(fastestRows, norm, "velocity");
            const valTime = (p1.lapTimeFromStart ?? 0) + 0.5 * ((p2.lapTimeFromStart ?? 0) - (p1.lapTimeFromStart ?? 0));
            const valVel = (p1.velocity ?? 0) + 0.5 * ((p2.velocity ?? 0) - (p1.velocity ?? 0));
            timeDeltas.push(valTime - refTime);
            const speedDelta = valVel - refVel;
            speedDeltas.push(speedDelta);
            speedDeltasPercent.push(refVel !== 0 ? (speedDelta / refVel) * 100 : 0);
          }
          const timeDeltaRates: number[] = [];
          for (let i = 0; i < timeDeltas.length; i++) 
          {
            const prev = i > 0 ? timeDeltas[i - 1] : 0;
            timeDeltaRates.push(timeDeltas[i] - prev);
          }
          const minTimeDelta = Math.min(...timeDeltas);
          const maxTimeDelta = Math.max(...timeDeltas);
          const minSpeedDelta = Math.min(...speedDeltas);
          const maxSpeedDelta = Math.max(...speedDeltas);
          const minSpeedDeltaPercent = Math.min(...speedDeltasPercent);
          const maxSpeedDeltaPercent = Math.max(...speedDeltasPercent);
          const minTimeDeltaRate = Math.min(...timeDeltaRates);
          const maxTimeDeltaRate = Math.max(...timeDeltaRates);

          // Batch consecutive segments with same color to reduce stroke() calls
          let lastColor = "";
          let lastWidthMult = 0;
          let pathStarted = false;
          for (let i = 1; i < rows.length; i++) 
          {
            const deltaForColor =
              colorType === "time" ? timeDeltas[i - 1] : colorType === "speed" ? speedDeltasPercent[i - 1] : timeDeltaRates[i - 1];
            const deltaForWidth =
              widthType === "time" ? timeDeltas[i - 1] : widthType === "speed" ? speedDeltas[i - 1] : timeDeltaRates[i - 1];
            const minColor = colorType === "time" ? minTimeDelta : colorType === "speed" ? minSpeedDeltaPercent : minTimeDeltaRate;
            const maxColor = colorType === "time" ? maxTimeDelta : colorType === "speed" ? maxSpeedDeltaPercent : maxTimeDeltaRate;
            const minWidth = widthType === "time" ? minTimeDelta : widthType === "speed" ? minSpeedDelta : minTimeDeltaRate;
            const maxWidth = widthType === "time" ? maxTimeDelta : widthType === "speed" ? maxSpeedDelta : maxTimeDeltaRate;
            const tColor = deltaToT(deltaForColor, minColor, maxColor);
            const tWidth = deltaToT(deltaForWidth, minWidth, maxWidth);
            const color = tToColor(tColor);
            let widthMult = tWidth <= 0 ? baseMult + tWidth * (baseMult - minMult) : baseMult + tWidth * (maxMult - baseMult);
            widthMult = Math.max(0.25, Math.min(8, widthMult));
            const p1 = rows[i - 1];
            const p2 = rows[i];
            const x1 = toLocal(p1.lat, p1.long).x;
            const y1 = toLocal(p1.lat, p1.long).y;
            const x2 = toLocal(p2.lat, p2.long).x;
            const y2 = toLocal(p2.lat, p2.long).y;

            if (color !== lastColor || widthMult !== lastWidthMult) 
            {
              if (pathStarted) 
              {
                ctx.stroke();
              }
              ctx.strokeStyle = color;
              ctx.lineWidth = baseLineWidth * widthMult;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              lastColor = color;
              lastWidthMult = widthMult;
              pathStarted = true;
            }
            else 
            {
              ctx.lineTo(x2, y2);
            }
          }
          if (pathStarted) ctx.stroke();
          ctx.restore();
          return;
        }

        ctx.strokeStyle = baseColor;
        ctx.beginPath();
        const firstRow = rows[0];
        ctx.moveTo(toLocal(firstRow.lat, firstRow.long).x, toLocal(firstRow.lat, firstRow.long).y);
        for (let i = 1; i < rows.length; i++) 
        {
          const row = rows[i];
          ctx.lineTo(toLocal(row.lat, row.long).x, toLocal(row.lat, row.long).y);
        }
        ctx.stroke();
      });

      ctx.shadowColor = "transparent";

      // Debug visualization of start-finish line for lap detection
      if (showStartFinishDebug && data.startFinish) 
      {
        const sf = data.startFinish;
        const sfLocal = toLocal(sf.point.lat, sf.point.long);
        const sfX = sfLocal.x;
        const sfY = sfLocal.y;

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
        const perp1 = toLocal(point1_gps.lat, point1_gps.long);
        const perp2 = toLocal(point2_gps.lat, point2_gps.long);
        const perpX1 = perp1.x;
        const perpY1 = perp1.y;
        const perpX2 = perp2.x;
        const perpY2 = perp2.y;

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
        const dirEnd = toLocal(arrowEnd_gps.lat, arrowEnd_gps.long);
        const dirEndX = dirEnd.x;
        const dirEndY = dirEnd.y;
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
              const p = toLocal(row.lat, row.long);
              const x = p.x;
              const y = p.y;
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

      // Debug visualization of sector detection lines
      if (showSectorDebug && data.trackData?.sectors?.length) 
      {
        const sectors = data.trackData.sectors;
        const sectorColors = [
          "rgba(255, 0, 255, 0.9)",   // S1 magenta
          "rgba(0, 255, 255, 0.9)",   // S2 cyan
          "rgba(255, 255, 0, 0.9)",   // S3 yellow
        ];

        sectors.forEach((sector, idx) => 
        {
          const halfWidth = sector.width / 2;
          const detectionX1_m = sector.pointMeters.x - sector.perpendicular.x * halfWidth;
          const detectionY1_m = sector.pointMeters.y - sector.perpendicular.y * halfWidth;
          const detectionX2_m = sector.pointMeters.x + sector.perpendicular.x * halfWidth;
          const detectionY2_m = sector.pointMeters.y + sector.perpendicular.y * halfWidth;

          const point1_gps = metersToGps(detectionX1_m, detectionY1_m, bbox.minLat, bbox.minLong);
          const point2_gps = metersToGps(detectionX2_m, detectionY2_m, bbox.minLat, bbox.minLong);

          const perp1 = toLocal(point1_gps.lat, point1_gps.long);
          const perp2 = toLocal(point2_gps.lat, point2_gps.long);
          const perpX1 = perp1.x;
          const perpY1 = perp1.y;
          const perpX2 = perp2.x;
          const perpY2 = perp2.y;

          const color = sectorColors[idx % sectorColors.length];

          ctx.strokeStyle = color;
          ctx.lineWidth = 4 / viewState.scale;
          ctx.beginPath();
          ctx.moveTo(perpX1, perpY1);
          ctx.lineTo(perpX2, perpY2);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.strokeStyle = "rgba(0, 0, 0, 1)";
          ctx.lineWidth = 2 / viewState.scale;
          const endPointSize = 5 / viewState.scale;
          ctx.beginPath();
          ctx.arc(perpX1, perpY1, endPointSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(perpX2, perpY2, endPointSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          const centerLocal = toLocal(sector.point.lat, sector.point.long);
          const centerX = centerLocal.x;
          const centerY = centerLocal.y;
          ctx.fillStyle = color;
          ctx.strokeStyle = "rgba(255, 255, 255, 1)";
          const centerSize = 6 / viewState.scale;
          ctx.beginPath();
          ctx.arc(centerX, centerY, centerSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        });
      }

      ctx.restore();

      // === DEBUG HOVER DRAWING (only when enabled) ===
      if (showHoverDebug && currentDebugHoverData && currentMousePos) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        const md = currentDebugHoverData;

        // Convert meters to GPS, then to Mercator local coords
        const toLocal = (lat: number, lng: number) => 
        {
          const m = latLngToMercator(lat, lng);
          return {
            x: (m.x - baseParams.centerMercX) * baseParams.baseScale,
            y: (m.y - baseParams.centerMercY) * baseParams.baseScale,
          };
        };
        const mouseGps = metersToGps(md.mouseMeters.x, md.mouseMeters.y, bbox.minLat, bbox.minLong);
        const mouseLocal = toLocal(mouseGps.lat, mouseGps.long);
        const mouseLX = mouseLocal.x;
        const mouseLY = mouseLocal.y;

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
        const metersPerLocalUnit =
          (40075000 * Math.cos((bbox.centerLat * Math.PI) / 180)) / baseParams.baseScale;
        const searchRadiusLocal = md.searchRadius / metersPerLocalUnit;
        ctx.beginPath();
        ctx.arc(mouseLX, mouseLY, searchRadiusLocal, 0, 2 * Math.PI);
        ctx.stroke();

        // 3. Min distance circle
        ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
        ctx.lineWidth = 2 / viewState.scale;
        const minDistLocal = md.minDistance / metersPerLocalUnit;
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

          const p1L = toLocal(p1Gps.lat, p1Gps.long);
          const p2L = toLocal(p2Gps.lat, p2Gps.long);
          const projL = toLocal(projGps.lat, projGps.long);
          const p1LX = p1L.x;
          const p1LY = p1L.y;
          const p2LX = p2L.x;
          const p2LY = p2L.y;
          const projLX = projL.x;
          const projLY = projL.y;

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
        let panelX = currentMousePos.x + 20;
        let panelY = currentMousePos.y - panelHeight;

        if (panelX + panelWidth > canvas.width) 
        {
          panelX = currentMousePos.x - panelWidth - 20;
        }
        if (panelY < 0) 
        {
          panelY = currentMousePos.y + 20;
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
          `Screen: (${currentMousePos.x.toFixed(0)}, ${currentMousePos.y.toFixed(0)})`,
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

        ctx.fillStyle = currentHoveredPoints.length > 0 ? "#00FF00" : "#FFFFFF";
        ctx.fillText(`Found: ${currentHoveredPoints.length} points`, panelX + 5, yOffset);

        ctx.restore();
      }

      // Hover points (final found points) - shown from local hover
      const isLocalHover = currentHoveredPoints.length > 0;
      if (isLocalHover) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        currentHoveredPoints.forEach((point) => 
        {
          // Convert point screen coords to canvas local
          const localX = (point.x - viewState.offsetX) / viewState.scale;
          const localY = (point.y - viewState.offsetY) / viewState.scale;

          // Draw point on trajectory
          ctx.fillStyle = point.lapColor;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / viewState.scale;
          const hoverPointSize = 5 / viewState.scale;
          ctx.beginPath();
          ctx.arc(localX, localY, hoverPointSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      }

      // Synced projection from charts (when not local hover) - use hoveredPoints which are already computed per-lap
      if (!isLocalHover && projection !== null && hoveredPointsForRenderRef.current.length > 0) 
      {
        ctx.save();
        ctx.translate(viewState.offsetX, viewState.offsetY);
        ctx.scale(viewState.scale, viewState.scale);

        // Draw projection points (already computed in useEffect with per-lap logic)
        hoveredPointsForRenderRef.current.forEach((pt) => 
        {
          const localX = (pt.x - viewState.offsetX) / viewState.scale;
          const localY = (pt.y - viewState.offsetY) / viewState.scale;

          const lap = data.laps.find((l) => l.index === pt.lapIndex);
          if (!lap) return;

          ctx.fillStyle = lap.color;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2 / viewState.scale;
          const pointSize = 4 / viewState.scale;
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
    showSectorDebug,
    showHoverDebug,
    trajectoryMode,
    deltaBaseWidthMult,
    deltaMinWidthMult,
    deltaMaxWidthMult,
    updateCounter,
    projection,
    hoveredPoints,
    mousePos,
    debugHoverData,
  ]);

  return (
    <div className="track-visualizer" ref={containerRef}>
      <button
        className="trajectory-mode-toggle"
        onClick={cycleTrajectoryMode}
        title={
          trajectoryMode === "normal"
            ? "Normal (lap colors)"
            : trajectoryMode === "timeDelta"
              ? "Time delta (green=faster, red=slower)"
              : trajectoryMode === "speedDelta"
                ? "Speed delta (green=faster, red=slower)"
                : "Delta of time delta (green=gaining, red=losing)"
        }
      >
        {trajectoryMode === "normal" && "Colors"}
        {trajectoryMode === "timeDelta" && "Δt"}
        {trajectoryMode === "speedDelta" && "Δv"}
        {trajectoryMode === "timeDeltaRate" && "d(Δt)"}
      </button>
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
          const offset = 28; // Larger gap from cursor for better visibility

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
              <h4>Delta Trajectory Width</h4>
              <div className="setting-item">
                <label className="setting-label">Base width: {deltaBaseWidthMult}x</label>
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.5"
                  value={deltaBaseWidthMult}
                  onChange={(e) => setDeltaBaseWidthMult(parseFloat(e.target.value))}
                  className="setting-slider"
                />
              </div>
              <div className="setting-item">
                <label className="setting-label">Min (green): {deltaMinWidthMult}x</label>
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={deltaMinWidthMult}
                  onChange={(e) => setDeltaMinWidthMult(parseFloat(e.target.value))}
                  className="setting-slider"
                />
              </div>
              <div className="setting-item">
                <label className="setting-label">Max (red): {deltaMaxWidthMult}x</label>
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="0.5"
                  value={deltaMaxWidthMult}
                  onChange={(e) => setDeltaMaxWidthMult(parseFloat(e.target.value))}
                  className="setting-slider"
                />
              </div>
              <div className="debug-line" style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>
                Base=default, Min=thinner when faster, Max=thicker when slower
              </div>
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
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showSectorDebug}
                  onChange={toggleSectorDebug}
                />
                <span>Show sector lines</span>
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

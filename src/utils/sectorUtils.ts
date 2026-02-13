/**
 * Sector computation utilities
 * - Create sector boundaries from fastest lap
 * - Find sector intersections and add interpolated points
 * - Compute sector times per lap
 */

import { BoundingBox, LapSectorData, VBODataRow } from "../models/types";
import { SectorBoundary, TrackData } from "../models/TrackData";
import { StartFinishLine } from "../models/types";
import { metersToGps } from "./coordinateUtils";
import { normalizeVector, perpendicular, segmentIntersection } from "./geometryUtils";

const SECTOR_COUNT = 4;

/**
 * Find point on trajectory at given distance from lap start (with interpolation)
 */
function findPointAtDistance(
  rows: VBODataRow[],
  targetDistance: number,
  bbox: BoundingBox,
): { point: VBODataRow; t: number; prevIdx: number } | null 
{
  if (rows.length < 2) return null;

  for (let i = 1; i < rows.length; i++) 
  {
    const p1 = rows[i - 1];
    const p2 = rows[i];
    const d1 = p1.lapDistanceFromStart ?? 0;
    const d2 = p2.lapDistanceFromStart ?? 0;
    const segDist = d2 - d1;

    if (d2 >= targetDistance && segDist > 0) 
    {
      const t = (targetDistance - d1) / segDist;
      const x = p1.x + t * (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);
      const gps = metersToGps(x, y, bbox.minLat, bbox.minLong);

      const time1 = parseTime(p1.time);
      const time2 = parseTime(p2.time);
      const timeMs = time1 + t * (time2 - time1);
      const timeFormatted = formatTimeMs(timeMs);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const direction = normalizeVector({ x: dx, y: dy });
      const perp = perpendicular(direction);

      const point: VBODataRow = {
        ...p1,
        lat: gps.lat,
        long: gps.long,
        x,
        y,
        time: timeFormatted,
        velocity: p1.velocity + t * (p2.velocity - p1.velocity),
        heading: p1.heading + t * (p2.heading - p1.heading),
        height: p1.height + t * (p2.height - p1.height),
        distance: t * segDist,
        deltaTime: t * (p2.deltaTime ?? 0),
        direction,
        perpendicular: perp,
        lapDistanceFromStart: targetDistance,
        lapTimeFromStart: timeMs - parseTime(rows[0].time),
        isInterpolated: true,
      };

      return { point, t, prevIdx: i - 1 };
    }
  }
  return null;
}

function parseTime(timeStr: string): number 
{
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length !== 3) return 0;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const ss = parseFloat(parts[2]);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return 0;
  return (hh * 3600 + mm * 60 + ss) * 1000;
}

function formatTimeMs(ms: number): string 
{
  const totalSeconds = ms / 1000;
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ssRemainder = totalSeconds % 60;
  const ssWhole = Math.floor(ssRemainder);
  const ssFrac = Math.floor((ssRemainder - ssWhole) * 1000);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ssWhole.toString().padStart(2, "0")}.${ssFrac.toString().padStart(3, "0")}`;
}

/**
 * Create sector boundaries from fastest lap trajectory
 */
export function computeSectorBoundaries(
  fastestLapRows: VBODataRow[],
  startFinish: StartFinishLine,
  bbox: BoundingBox,
): SectorBoundary[] 
{
  const totalDistance = fastestLapRows[fastestLapRows.length - 1]?.lapDistanceFromStart ?? 0;
  if (totalDistance <= 0) return [];

  const sectorLength = totalDistance / SECTOR_COUNT;
  const sectorWidth = startFinish.width / 2;
  const sectors: SectorBoundary[] = [];

  for (let i = 1; i < SECTOR_COUNT; i++) 
  {
    const boundaryDistance = i * sectorLength;
    const result = findPointAtDistance(fastestLapRows, boundaryDistance, bbox);
    if (!result) continue;

    const { point } = result;
    const direction = point.direction ?? { x: 1, y: 0 };
    const perpendicular = point.perpendicular ?? { x: 0, y: 1 };

    sectors.push({
      startDistance: boundaryDistance,
      length: sectorLength,
      point: { lat: point.lat, long: point.long },
      pointMeters: { x: point.x, y: point.y },
      direction,
      perpendicular,
      width: sectorWidth,
    });
  }

  return sectors;
}

/**
 * Find intersection of trajectory segment with sector boundary
 * Returns parameter t [0,1] on trajectory segment if intersection exists
 */
function findSectorIntersection(
  p1: VBODataRow,
  p2: VBODataRow,
  sector: SectorBoundary,
): number | null 
{
  const halfWidth = sector.width / 2;
  const x1 = sector.pointMeters.x - sector.perpendicular.x * halfWidth;
  const y1 = sector.pointMeters.y - sector.perpendicular.y * halfWidth;
  const x2 = sector.pointMeters.x + sector.perpendicular.x * halfWidth;
  const y2 = sector.pointMeters.y + sector.perpendicular.y * halfWidth;

  return segmentIntersection(p1.x, p1.y, p2.x, p2.y, x1, y1, x2, y2);
}

/**
 * Add interpolated points at sector boundaries to lap rows
 */
export function addSectorPointsToRows(
  rows: VBODataRow[],
  sectors: SectorBoundary[],
  bbox: BoundingBox,
): VBODataRow[] 
{
  if (rows.length < 2 || sectors.length === 0) return rows;

  const result: VBODataRow[] = [];
  const firstTime = parseTime(rows[0].time);
  let cumulativeDist = 0;

  for (let i = 0; i < rows.length; i++) 
  {
    result.push({ ...rows[i] });
    if (i === 0) continue;

    const p1 = rows[i - 1];
    const p2 = rows[i];
    const segDist = p2.distance ?? 0;

    const crossings: { t: number; dist: number; sectorIndex: number }[] = [];
    for (let si = 0; si < sectors.length; si++) 
    {
      const t = findSectorIntersection(p1, p2, sectors[si]);
      if (t !== null && t > 0.001 && t < 0.999) 
      {
        crossings.push({ t, dist: cumulativeDist + t * segDist, sectorIndex: si });
      }
    }
    crossings.sort((a, b) => a.t - b.t);

    for (const { t, dist, sectorIndex } of crossings) 
    {
      const x = p1.x + t * (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);
      const gps = metersToGps(x, y, bbox.minLat, bbox.minLong);

      const time1 = parseTime(p1.time);
      const time2 = parseTime(p2.time);
      const timeMs = time1 + t * (time2 - time1);
      const timeFormatted = formatTimeMs(timeMs);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const direction = normalizeVector({ x: dx, y: dy });
      const perp = perpendicular(direction);

      const interpRow: VBODataRow = {
        ...p1,
        lat: gps.lat,
        long: gps.long,
        x,
        y,
        time: timeFormatted,
        velocity: p1.velocity + t * (p2.velocity - p1.velocity),
        heading: p1.heading + t * (p2.heading - p1.heading),
        height: p1.height + t * (p2.height - p1.height),
        distance: 0,
        deltaTime: t * (p2.deltaTime ?? 0),
        direction,
        perpendicular: perp,
        lapDistanceFromStart: dist,
        lapTimeFromStart: timeMs - firstTime,
        isInterpolated: true,
        sectorBoundaryIndex: sectorIndex,
      };

      result.push(interpRow);
    }
    cumulativeDist += segDist;
  }

  // Recompute distance and lapDistanceFromStart for all points
  for (let i = 0; i < result.length; i++) 
  {
    if (i === 0) 
    {
      result[i].lapDistanceFromStart = 0;
      result[i].distance = 0;
    }
    else 
    {
      const prev = result[i - 1];
      const curr = result[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const segDist = Math.sqrt(dx * dx + dy * dy);
      curr.distance = segDist;
      curr.lapDistanceFromStart = (prev.lapDistanceFromStart ?? 0) + segDist;
    }
  }

  return result;
}

/**
 * Compute sector times for a lap using geometric sector boundaries.
 * Uses interpolated points at sector detection lines (all laps align at same line).
 */
export function computeLapSectorData(
  rows: VBODataRow[],
  _trackLength: number,
): LapSectorData[] 
{
  const sectorData: LapSectorData[] = [];
  if (rows.length < 2) return [];

  const boundaryIndices: number[] = [-1, -1, -1];
  for (let i = 0; i < rows.length; i++) 
  {
    const sb = rows[i].sectorBoundaryIndex;
    if (sb !== undefined && sb >= 0 && sb < 3 && boundaryIndices[sb] === -1) 
    {
      boundaryIndices[sb] = i;
    }
  }

  for (let s = 0; s < SECTOR_COUNT; s++) 
  {
    const startRowIndex = s === 0 ? 0 : boundaryIndices[s - 1];
    const endRowIndex = s < 3 ? boundaryIndices[s] : rows.length - 1;

    if (startRowIndex < 0 || endRowIndex < 0 || endRowIndex < startRowIndex) continue;

    const startTimeMs = rows[startRowIndex].lapTimeFromStart ?? 0;
    const endTimeMs = rows[endRowIndex].lapTimeFromStart ?? 0;
    const timeMs = endTimeMs - startTimeMs;

    if (timeMs >= 0) 
    {
      sectorData.push({
        sectorIndex: s,
        timeMs,
        startRowIndex,
        endRowIndex,
      });
    }
  }

  return sectorData;
}

/**
 * Create TrackData from fastest lap
 */
export function createTrackData(
  fastestLapRows: VBODataRow[],
  startFinish: StartFinishLine,
  bbox: BoundingBox,
  name: string = "Track",
): TrackData 
{
  const totalDistance = fastestLapRows[fastestLapRows.length - 1]?.lapDistanceFromStart ?? 0;
  const sectors = computeSectorBoundaries(fastestLapRows, startFinish, bbox);

  return {
    name,
    length: totalDistance,
    startFinish,
    sectors,
  };
}

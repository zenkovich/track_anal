/**
 * VBO file parser (dragy format)
 *
 * Main flow:
 * 1. Parse header and data from text file
 * 2. Convert coordinates VBO -> GPS -> meters
 * 3. Compute derived parameters (speed, direction)
 * 4. Detect start/finish line
 * 5. Split into laps
 */

import { LapData, getLapColor } from "../models/LapData";
import { VBOData } from "../models/VBOData";
import { BoundingBox, StartFinishLine, VBODataRow, VBOHeader } from "../models/types";
import {
    formatVBOTime,
    gpsToMeters,
    haversineDistance,
    metersToGps,
    parseFormattedTimeToMs,
    vboToDecimal,
} from "./coordinateUtils";
import { normalizeVector, perpendicular, segmentIntersection } from "./geometryUtils";

/**
 * Main VBO file parser class
 */
export class VBOParser 
{
  /**
   * Parse VBO file content and return structured data
   *
   * @param content Text content of VBO file
   * @returns VBOData with track and laps
   */
  static parse(content: string): VBOData 
  {
    console.log("=== VBO Parser Start ===");

    // 1. Parse file text
    const { header, rows } = this.parseFileContent(content);
    console.log(`Parsed ${rows.length} data rows`);

    // 2. Compute track bounds
    const boundingBox = this.calculateBoundingBox(rows);
    console.log(
      `Bounding box: [${boundingBox.minLat.toFixed(6)}, ${boundingBox.minLong.toFixed(6)}] - [${boundingBox.maxLat.toFixed(6)}, ${boundingBox.maxLong.toFixed(6)}]`,
    );

    // 3. Add metric coordinates
    this.addMetricCoordinates(rows, boundingBox);

    // 4. Compute derived parameters (distance, direction)
    this.calculateDerivedData(rows);

    // 5. Detect start/finish line
    const startFinish = this.detectStartFinish(rows, boundingBox);
    if (startFinish) 
    {
      console.log(
        `Start/Finish detected at (${startFinish.pointMeters.x.toFixed(2)}, ${startFinish.pointMeters.y.toFixed(2)})m`,
      );
    }

    // 6. Split into laps
    const laps = this.splitIntoLaps(rows, boundingBox, startFinish);
    console.log(`Detected ${laps.length} laps`);

    // 7. Create data model
    const vboData = new VBOData(header, rows, boundingBox, startFinish, laps);

    // 8. Apply filtering heuristic (hide laps deviating from median > 15%)
    vboData.applyTimeHeuristics(15);

    // 9. Recalculate charts with best lap (for deltas)
    vboData.recalculateChartsForAllLaps();

    // 10. Compute track data (sectors from fastest lap) and sector times per lap
    vboData.computeTrackData();

    console.log("=== VBO Parser Complete ===");
    return vboData;
  }

  /**
   * Parse file text content
   */
  private static parseFileContent(content: string): {
    header: VBOHeader;
    rows: VBODataRow[];
  } 
  {
    const lines = content.split("\n").map((line) => line.trim());

    const header: VBOHeader = {
      columnNames: [],
      comments: [],
    };
    const rows: VBODataRow[] = [];

    let currentSection = "";

    for (const line of lines) 
    {
      if (!line) continue;

      // Section detection
      if (line.startsWith("[") && line.endsWith("]")) 
      {
        currentSection = line.slice(1, -1).toLowerCase();
        continue;
      }

      // Section handling
      switch (currentSection) 
      {
        case "comments":
          header.comments.push(line);
          break;

        case "column names":
          header.columnNames = line.split(/\s+/);
          break;

        case "data":
          const row = this.parseDataRow(line);
          if (row) rows.push(row);
          break;

        default:
          if (line.startsWith("File created on")) 
          {
            header.fileCreated = line;
          }
      }
    }

    return { header, rows };
  }

  /**
   * Parse single data row
   */
  private static parseDataRow(line: string): VBODataRow | null 
  {
    const parts = line.split(/\s+/);

    if (parts.length < 7) return null;

    try 
    {
      const vboLat = parseFloat(parts[2]);
      const vboLong = parseFloat(parts[3]);

      // Convert VBO coordinates to GPS (decimal degrees)
      const lat = vboToDecimal(vboLat, true);
      const long = vboToDecimal(vboLong, false);

      return {
        sats: parseInt(parts[0], 10),
        time: formatVBOTime(parts[1]),
        lat,
        long,
        velocity: parseFloat(parts[4]),
        heading: parseFloat(parts[5]),
        height: parseFloat(parts[6]),
        x: 0, // set in addMetricCoordinates
        y: 0, // set in addMetricCoordinates
      };
    }
    catch (error) 
    {
      console.error("Error parsing row:", line, error);
      return null;
    }
  }

  /**
   * Compute track bounds (bounding box)
   */
  private static calculateBoundingBox(rows: VBODataRow[]): BoundingBox 
  {
    const bbox: BoundingBox = {
      minLat: Infinity,
      maxLat: -Infinity,
      minLong: Infinity,
      maxLong: -Infinity,
      centerLat: 0,
      centerLong: 0,
      width: 0,
      height: 0,
    };

    // Find min/max
    for (const row of rows) 
    {
      if (row.lat < bbox.minLat) bbox.minLat = row.lat;
      if (row.lat > bbox.maxLat) bbox.maxLat = row.lat;
      if (row.long < bbox.minLong) bbox.minLong = row.long;
      if (row.long > bbox.maxLong) bbox.maxLong = row.long;
    }

    // Compute center and dimensions
    bbox.centerLat = (bbox.minLat + bbox.maxLat) / 2;
    bbox.centerLong = (bbox.minLong + bbox.maxLong) / 2;
    bbox.width = bbox.maxLong - bbox.minLong;
    bbox.height = bbox.maxLat - bbox.minLat;

    return bbox;
  }

  /**
   * Add metric coordinates (x, y in meters)
   */
  private static addMetricCoordinates(rows: VBODataRow[], bbox: BoundingBox): void 
  {
    // Use bottom-left corner as origin (0, 0)
    const originLat = bbox.minLat;
    const originLong = bbox.minLong;

    for (const row of rows) 
    {
      const meters = gpsToMeters(row.lat, row.long, originLat, originLong);
      row.x = meters.x;
      row.y = meters.y;
    }
  }

  /**
   * Compute derived parameters (distance, direction, deltaTime)
   */
  private static calculateDerivedData(rows: VBODataRow[]): void 
  {
    for (let i = 1; i < rows.length; i++) 
    {
      const prev = rows[i - 1];
      const curr = rows[i];

      // Time relative to previous point (time already in HH:MM:SS.mmm format)
      const prevTime = parseFormattedTimeToMs(prev.time);
      const currTime = parseFormattedTimeToMs(curr.time);
      curr.deltaTime = currTime - prevTime;

      // Haversine distance
      curr.distance = haversineDistance(prev.lat, prev.long, curr.lat, curr.long);

      // Movement direction (normalized vector)
      const dx = curr.long - prev.long;
      const dy = curr.lat - prev.lat;
      curr.direction = normalizeVector({ x: dx, y: dy });

      // Perpendicular to direction
      curr.perpendicular = perpendicular(curr.direction);
    }

    // First point takes data from second
    if (rows.length > 1) 
    {
      rows[0].deltaTime = 0;
      rows[0].distance = 0;
      rows[0].direction = rows[1].direction;
      rows[0].perpendicular = rows[1].perpendicular;
    }
  }

  /**
   * Detect start/finish line by point of max velocity
   */
  private static detectStartFinish(
    rows: VBODataRow[],
    _bbox: BoundingBox, // _ prefix to indicate intentionally unused
  ): StartFinishLine | undefined 
  {
    if (rows.length < 50) return undefined;

    // Find point with max velocity (not at edges)
    let maxVelIdx = 0;
    let maxVel = 0;
    for (let i = 20; i < rows.length - 20; i++) 
    {
      if (rows[i].velocity > maxVel) 
      {
        maxVel = rows[i].velocity;
        maxVelIdx = i;
      }
    }

    // Collect points 20 meters before max velocity point
    let cumulativeDistance = 0;
    let startIdx = maxVelIdx;
    const targetDistance = 20; // meters

    for (let i = maxVelIdx - 1; i >= 0 && cumulativeDistance < targetDistance; i--) 
    {
      const distance = rows[i]?.distance;
      if (distance) 
      {
        cumulativeDistance += distance;
      }
      startIdx = i;
    }

    // Compute average direction in metric coordinates
    let avgDirX = 0;
    let avgDirY = 0;
    let count = 0;

    for (let i = startIdx + 1; i <= maxVelIdx; i++) 
    {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (prev && curr) 
      {
        avgDirX += curr.x - prev.x;
        avgDirY += curr.y - prev.y;
        count++;
      }
    }

    if (count === 0) return undefined;

    const direction = normalizeVector({ x: avgDirX / count, y: avgDirY / count });
    const perp = perpendicular(direction);

    const sfRow = rows[maxVelIdx];

    return {
      point: { lat: sfRow.lat, long: sfRow.long },
      pointMeters: { x: sfRow.x, y: sfRow.y },
      direction,
      perpendicular: perp,
      width: 40, // meters
    };
  }

  /**
   * Split track into laps by intersections with start/finish line
   */
  private static splitIntoLaps(
    rows: VBODataRow[],
    bbox: BoundingBox,
    startFinish?: StartFinishLine,
  ): LapData[] 
  {
    // If no start/finish line - whole track is one lap
    if (!startFinish || rows.length < 10) 
    {
      return [new LapData(0, rows, getLapColor(0), 0, rows.length - 1, rows)];
    }

    const sf = startFinish;
    const laps: LapData[] = [];

    // Compute two points of detection segment (perpendicular to movement direction)
    const halfWidth = sf.width / 2;
    const detectionX1 = sf.pointMeters.x - sf.perpendicular.x * halfWidth;
    const detectionY1 = sf.pointMeters.y - sf.perpendicular.y * halfWidth;
    const detectionX2 = sf.pointMeters.x + sf.perpendicular.x * halfWidth;
    const detectionY2 = sf.pointMeters.y + sf.perpendicular.y * halfWidth;

    let currentLapRows: VBODataRow[] = [rows[0]];
    let lapStartIdx = 0; // Start index of current lap in source array
    const minLapSize = 50; // minimum points per lap

    // Process points in order
    for (let i = 1; i < rows.length; i++) 
    {
      const p1 = rows[i - 1];
      const p2 = rows[i];

      // Check trajectory segment intersection with detection segment
      const t = segmentIntersection(
        p1.x,
        p1.y,
        p2.x,
        p2.y,
        detectionX1,
        detectionY1,
        detectionX2,
        detectionY2,
      );

      // If intersection found and minimum points reached
      if (t !== null && currentLapRows.length >= minLapSize) 
      {
        // Create interpolated point at intersection
        const intersectionPoint = this.interpolatePoint(p1, p2, t, bbox);

        // Finish current lap
        currentLapRows.push(intersectionPoint);
        const lapEndIdx = i - 1; // Lap end - last full point

        laps.push(
          new LapData(
            laps.length,
            currentLapRows,
            getLapColor(laps.length),
            lapStartIdx,
            lapEndIdx,
            rows, // Pass source array for time calculation
          ),
        );

        // Start new lap with copy of interpolated point
        currentLapRows = [{ ...intersectionPoint }];
        lapStartIdx = i; // Next lap starts at current point
      }
      else 
      {
        // Add point to current lap
        currentLapRows.push(p2);
      }
    }

    // Add last lap
    if (currentLapRows.length > 1) 
    {
      const lapEndIdx = rows.length - 1;
      laps.push(
        new LapData(
          laps.length,
          currentLapRows,
          getLapColor(laps.length),
          lapStartIdx,
          lapEndIdx,
          rows,
        ),
      );
    }

    // If no intersections - whole track is one lap
    if (laps.length === 0) 
    {
      laps.push(new LapData(0, rows, getLapColor(0), 0, rows.length - 1, rows));
    }

    return laps;
  }

  /**
   * Interpolate point between two points
   */
  private static interpolatePoint(
    p1: VBODataRow,
    p2: VBODataRow,
    t: number,
    bbox: BoundingBox,
  ): VBODataRow 
  {
    // Interpolation in meters
    const x = p1.x + t * (p2.x - p1.x);
    const y = p1.y + t * (p2.y - p1.y);

    // Convert back to GPS
    const gps = metersToGps(x, y, bbox.minLat, bbox.minLong);

    // Time interpolation (use parseFormattedTimeToMs for HH:MM:SS.mmm format)
    const time1 = parseFormattedTimeToMs(p1.time);
    const time2 = parseFormattedTimeToMs(p2.time);
    const timeMs = time1 + t * (time2 - time1);

    // Format time as HH:MM:SS.mmm
    const totalSeconds = timeMs / 1000;
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ssRemainder = totalSeconds % 60;
    const ssWhole = Math.floor(ssRemainder);
    const ssFrac = Math.floor((ssRemainder - ssWhole) * 1000);

    const timeFormatted = `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ssWhole.toString().padStart(2, "0")}.${ssFrac.toString().padStart(3, "0")}`;

    return {
      sats: p1.sats,
      time: timeFormatted,
      lat: gps.lat,
      long: gps.long,
      velocity: p1.velocity + t * (p2.velocity - p1.velocity),
      heading: p1.heading + t * (p2.heading - p1.heading),
      height: p1.height + t * (p2.height - p1.height),
      x,
      y,
      distance: t * (p2.distance || 0),
      deltaTime: t * (p2.deltaTime || 0),
      direction: p1.direction,
      perpendicular: p1.perpendicular,
      isInterpolated: true,
    };
  }
}

// Export legacy types for backward compatibility
export type {
    BoundingBox,
    StartFinishLine, VBODataRow, VBOHeader, Vector2D
} from "../models/types";

// Export VBOData
export { VBOData } from "../models/VBOData";

// Export conversion functions for use in TrackVisualizer
export { gpsToMeters, metersToGps, parseFormattedTimeToMs } from "./coordinateUtils";

// Lap interface for backward compatibility
export interface Lap {
  index: number;
  startIdx: number;
  endIdx: number;
  rows: VBODataRow[];
}

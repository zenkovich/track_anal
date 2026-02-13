/**
 * Lap data model with parameters and visibility
 */

import { CHART_TYPES, ChartType, IChart, createChart } from "./charts";
import { LapSectorData, VBODataRow } from "./types";

/**
 * Lap statistics
 */
export interface LapStats {
  name: string; // Lap name (e.g. "Lap 1")
  distance: number; // Distance (meters)
  time: number; // Time (milliseconds)
  maxSpeed: number; // Max speed (km/h)
  timeFormatted: string; // Time in MM:SS.mmm format
}

/**
 * Single lap data with points and parameters
 */
export class LapData 
{
  /** Lap index (0-based) */
  readonly index: number;

  /** Track points of this lap */
  readonly rows: VBODataRow[];

  /** Lap visibility on map */
  visible: boolean = true;

  /** Lap color */
  readonly color: string;

  /** Indices in source array for time calculation */
  readonly startIdx: number;
  readonly endIdx: number;

  /** Reference to source array of all points (for time calculation) */
  private readonly allRows?: VBODataRow[];

  /** Charts for this lap */
  private _charts: Map<ChartType, IChart> = new Map();

  /** Sector times and indices (set by VBOData.computeTrackData) */
  private _sectorData: LapSectorData[] = [];

  constructor(
    index: number,
    rows: VBODataRow[],
    color: string,
    startIdx: number = 0,
    endIdx: number = 0,
    allRows?: VBODataRow[],
  ) 
  {
    this.index = index;
    this.rows = rows;
    this.color = color;
    this.startIdx = startIdx;
    this.endIdx = endIdx;
    this.allRows = allRows;

    // Initialize time and distance from lap start for each point
    this.initializeLapParameters();

    // Calculate all charts
    this.calculateCharts();
  }

  /**
   * Calculate all chart types for this lap
   * @param referenceLap Reference lap (for delta charts)
   */
  calculateCharts(referenceLap?: LapData): void 
  {
    // Create and calculate chart for each type
    CHART_TYPES.forEach((chartType) => 
    {
      const chart = createChart(chartType.type);
      chart.calculate(this, referenceLap);
      this._charts.set(chartType.type, chart);
    });
  }

  /**
   * Recalculate charts (e.g. when reference lap changes)
   * @param referenceLap Reference lap
   */
  recalculateCharts(referenceLap?: LapData): void 
  {
    this._charts.forEach((chart) => 
    {
      chart.calculate(this, referenceLap);
    });
  }

  /**
   * Get chart by type
   */
  getChart(type: ChartType): IChart | undefined 
  {
    return this._charts.get(type);
  }

  /**
   * Get all charts
   */
  getAllCharts(): Map<ChartType, IChart> 
  {
    return this._charts;
  }

  /**
   * Get sector data (times and indices)
   */
  getSectorData(): LapSectorData[] 
  {
    return this._sectorData;
  }

  /**
   * Set sector data (called by VBOData.computeTrackData)
   */
  setSectorData(data: LapSectorData[]): void 
  {
    this._sectorData = data;
  }

  /**
   * Initialize time and distance from lap start for each point
   */
  private initializeLapParameters(): void 
  {
    if (this.rows.length === 0) return;

    const firstRow = this.rows[0];
    const startTime = this.parseTime(firstRow.time);
    let cumulativeDistance = 0;

    this.rows.forEach((row, idx) => 
    {
      // Time from lap start (always relative to first point of THIS lap)
      const rowTime = this.parseTime(row.time);
      row.lapTimeFromStart = rowTime - startTime;

      // Distance from lap start
      if (idx > 0 && row.distance) 
      {
        cumulativeDistance += row.distance;
      }
      row.lapDistanceFromStart = cumulativeDistance;
    });
  }

  /**
   * Compute lap statistics
   */
  getStats(): LapStats 
  {
    // Distance (sum of all distance)
    let distance = 0;
    for (const row of this.rows) 
    {
      if (row.distance) 
      {
        distance += row.distance;
      }
    }

    // Time (difference between first and last point)
    const timeMs = this.calculateTimeMs();

    // Max speed
    let maxSpeed = 0;
    for (const row of this.rows) 
    {
      if (row.velocity > maxSpeed) 
      {
        maxSpeed = row.velocity;
      }
    }

    return {
      name: `Lap ${this.index + 1}`,
      distance: Math.round(distance),
      time: timeMs,
      maxSpeed: Math.round(maxSpeed),
      timeFormatted: this.formatTime(timeMs),
    };
  }

  /**
   * Calculate lap time in milliseconds
   */
  private calculateTimeMs(): number 
  {
    // If we have source array and indices, use them
    if (this.allRows && this.startIdx >= 0 && this.endIdx > this.startIdx) 
    {
      const firstTimeStr = this.allRows[this.startIdx]?.time;
      const lastTimeStr = this.allRows[this.endIdx]?.time;

      if (firstTimeStr && lastTimeStr) 
      {
        const firstTime = this.parseTime(firstTimeStr);
        const lastTime = this.parseTime(lastTimeStr);
        return Math.max(0, lastTime - firstTime);
      }
    }

    // Fallback: use first and last point of lap
    if (this.rows.length < 2) return 0;

    const firstTimeStr = this.rows[0].time;
    const lastTimeStr = this.rows[this.rows.length - 1].time;

    const firstTime = this.parseTime(firstTimeStr);
    const lastTime = this.parseTime(lastTimeStr);

    return Math.max(0, lastTime - firstTime);
  }

  /**
   * Parse time from HH:MM:SS.mmm string to milliseconds
   */
  private parseTime(timeStr: string): number 
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

  /**
   * Format milliseconds to M:SS.mmm string (as in table)
   */
  private formatTime(ms: number): string 
  {
    if (isNaN(ms) || ms < 0) return "0:00.000";

    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const secondsRemainder = totalSeconds - minutes * 60;
    const secWhole = Math.floor(secondsRemainder);
    const secFrac = Math.floor((secondsRemainder - secWhole) * 1000);

    return `${minutes}:${secWhole.toString().padStart(2, "0")}.${secFrac.toString().padStart(3, "0")}`;
  }

  /**
   * Toggle lap visibility
   */
  toggleVisibility(): void 
  {
    this.visible = !this.visible;
  }

  /**
   * Set lap visibility
   */
  setVisibility(visible: boolean): void 
  {
    this.visible = visible;
  }
}

/**
 * Lap color palette (bright, distinguishable colors)
 */
export const LAP_COLORS = [
  "#FF6B00", // bright orange
  "#00FFD1", // neon cyan
  "#FF0080", // neon pink
  "#FFD700", // gold
  "#7FFF00", // neon lime
  "#FF1493", // deep pink
  "#00E5FF", // bright cyan
  "#FFB000", // amber
  "#B026FF", // neon purple
  "#00FF7F", // spring green
  "#FF4500", // orange red
  "#39FF14", // neon green
  "#FF69B4", // hot pink
  "#00BFFF", // deep sky blue
  "#FFAA00", // orange yellow
  "#DA70D6", // orchid
];

/**
 * Get lap color by index
 */
export function getLapColor(lapIndex: number): string 
{
  return LAP_COLORS[lapIndex % LAP_COLORS.length];
}

/**
 * VBO file data model
 */

import { LapData, getLapColor } from "./LapData";
import { TrackData } from "./TrackData";
import { BoundingBox, StartFinishLine, VBODataRow, VBOHeader } from "./types";
import {
  addSectorPointsToRows,
  computeLapSectorData,
  createTrackData,
} from "../utils/sectorUtils";

/**
 * Main VBO file data class with all tracks and laps
 */
export class VBOData 
{
  /** File header with metadata */
  readonly header: VBOHeader;

  /** All track points */
  readonly rows: VBODataRow[];

  /** Track bounds (bounding box) */
  readonly boundingBox: BoundingBox;

  /** Start/finish line (if detected) */
  readonly startFinish?: StartFinishLine;

  /** Track data (name, sectors) - created after heuristics */
  private _trackData: TrackData | null = null;

  /**
   * Track laps with parameters and visibility
   *
   * IMPORTANT: Lap visibility (lap.visible) is shared app state.
   * All components use it:
   * - LapsPanel: checkboxes control lap.visible
   * - TrackVisualizer: draws only laps with lap.visible=true
   * - ChartsPanel: shows charts only for laps with lap.visible=true
   * - Tooltip: shows data only for laps with lap.visible=true
   */
  private _laps: LapData[];

  constructor(
    header: VBOHeader,
    rows: VBODataRow[],
    boundingBox: BoundingBox,
    startFinish?: StartFinishLine,
    laps: LapData[] = [],
  ) 
  {
    this.header = header;
    this.rows = rows;
    this.boundingBox = boundingBox;
    this.startFinish = startFinish;
    this._laps = laps;
  }

  /**
   * Get all laps
   */
  get laps(): LapData[] 
  {
    return this._laps;
  }

  /**
   * Get track data (sectors, etc.)
   */
  get trackData(): TrackData | null 
  {
    return this._trackData;
  }

  /**
   * Set laps (used by parser)
   */
  setLaps(laps: LapData[]): void 
  {
    this._laps = laps;
  }

  /**
   * Get visible laps
   */
  getVisibleLaps(): LapData[] 
  {
    return this._laps.filter((lap) => lap.visible);
  }

  /**
   * Find fastest lap among visible
   * @returns Index of fastest lap or null if none visible
   */
  getFastestVisibleLap(): number | null 
  {
    const visibleLaps = this.getVisibleLaps();
    if (visibleLaps.length === 0) return null;

    let fastestLap = visibleLaps[0];
    let fastestTime = fastestLap.getStats().time;

    for (const lap of visibleLaps) 
    {
      const stats = lap.getStats();
      if (stats.time > 0 && stats.time < fastestTime) 
      {
        fastestTime = stats.time;
        fastestLap = lap;
      }
    }

    return fastestLap.index;
  }

  /**
   * Compute median of lap times
   */
  private getMedianTime(): number | null 
  {
    const times = this._laps
      .map((l) => l.getStats().time)
      .filter((time) => time > 0)
      .sort((a, b) => a - b);

    if (times.length === 0) return null;

    const mid = Math.floor(times.length / 2);
    if (times.length % 2 === 0) 
    {
      return (times[mid - 1] + times[mid]) / 2;
    }
    else 
    {
      return times[mid];
    }
  }

  /**
   * Check if lap is outlier based on deviation from median
   * @param lapIndex Lap index
   * @param tolerancePercent Allowed deviation from median in percent (default 15%)
   * @returns true if lap is outlier
   */
  isOutlier(lapIndex: number, tolerancePercent: number = 15): boolean 
  {
    const lap = this._laps[lapIndex];
    if (!lap) return false;

    if (this._laps.length < 3) return false;

    const median = this.getMedianTime();
    if (median === null) return false;

    const lapTime = lap.getStats().time;
    if (lapTime <= 0) return false;

    // Compute allowed range
    const tolerance = median * (tolerancePercent / 100);
    const minTime = median - tolerance;
    const maxTime = median + tolerance;

    return lapTime < minTime || lapTime > maxTime;
  }

  /**
   * Apply heuristic to auto-filter laps: hide laps deviating from median by more than tolerancePercent
   * @param tolerancePercent Allowed deviation from median in percent (default 15%)
   */
  applyTimeHeuristics(tolerancePercent: number = 15): void 
  {
    if (this._laps.length < 3) return;

    const median = this.getMedianTime();
    if (median === null) return;

    const tolerance = median * (tolerancePercent / 100);
    const minTime = median - tolerance;
    const maxTime = median + tolerance;

    console.log(`[Heuristics] Total laps: ${this._laps.length}`);
    console.log(`[Heuristics] Median time: ${(median / 1000).toFixed(2)}s`);
    console.log(
      `[Heuristics] Tolerance: ±${tolerancePercent}% (±${(tolerance / 1000).toFixed(2)}s)`,
    );
    console.log(
      `[Heuristics] Valid range: ${(minTime / 1000).toFixed(2)}s - ${(maxTime / 1000).toFixed(2)}s`,
    );

    // Hide laps outside range
    let hiddenCount = 0;
    this._laps.forEach((lap) => 
    {
      const stats = lap.getStats();
      if (stats.time > 0 && (stats.time < minTime || stats.time > maxTime)) 
      {
        lap.setVisibility(false);
        hiddenCount++;
      }
    });

    console.log(`[Heuristics] Hidden ${hiddenCount} outlier laps`);
  }

  /**
   * Compute track data and sector times for all laps
   * Call after applyTimeHeuristics (fastest lap excludes outliers)
   */
  computeTrackData(): void 
  {
    if (!this.startFinish || this._laps.length === 0) return;

    const fastestIdx = this.getFastestVisibleLap();
    if (fastestIdx === null) return;

    const fastestLap = this._laps[fastestIdx];
    const fastestRows = fastestLap.rows;
    const trackLength = fastestLap.getStats().distance;

    if (trackLength <= 0) return;

    const trackName = this.getMetadata()["Model"] ?? "Track";
    this._trackData = createTrackData(
      fastestRows,
      this.startFinish,
      this.boundingBox,
      trackName,
    );

    const sectors = this._trackData.sectors;

    this._laps = this._laps.map((lap) => 
    {
      const enhancedRows = addSectorPointsToRows(
        lap.rows,
        sectors,
        this.boundingBox,
      );

      const newLap = new LapData(
        lap.index,
        enhancedRows,
        lap.color,
        lap.startIdx,
        lap.endIdx,
        this.rows,
      );
      newLap.visible = lap.visible;

      const sectorData = computeLapSectorData(enhancedRows, trackLength);
      newLap.setSectorData(sectorData);

      return newLap;
    });

    this.recalculateChartsForAllLaps();
    console.log(`[TrackData] Created track "${trackName}", ${sectors.length} sector boundaries`);
  }

  /**
   * Get indices of visible laps (for backward compatibility)
   */
  getVisibleLapIndices(): Set<number> 
  {
    return new Set(this._laps.filter((lap) => lap.visible).map((lap) => lap.index));
  }

  /**
   * Toggle lap visibility by index
   */
  toggleLapVisibility(lapIndex: number): void 
  {
    const lap = this._laps[lapIndex];
    if (lap) 
    {
      lap.toggleVisibility();
      // Recalculate charts when visibility changes (fastest lap may change)
      this.recalculateChartsForAllLaps();
    }
  }

  /**
   * Recalculate charts for all laps (when best lap changes)
   */
  recalculateChartsForAllLaps(): void 
  {
    const fastestLapIndex = this.getFastestVisibleLap();
    const referenceLap = fastestLapIndex !== null ? this._laps[fastestLapIndex] : undefined;

    this._laps.forEach((lap) => 
    {
      lap.recalculateCharts(referenceLap);
    });
  }

  /**
   * Show/hide all laps
   */
  setAllLapsVisibility(visible: boolean): void 
  {
    this._laps.forEach((lap) => lap.setVisibility(visible));
    // Recalculate charts on bulk change
    this.recalculateChartsForAllLaps();
  }

  /**
   * Get file metadata
   */
  getMetadata(): Record<string, string> 
  {
    const metadata: Record<string, string> = {};

    // Parse comments
    this.header.comments.forEach((comment) => 
    {
      const colonIndex = comment.indexOf(":");
      if (colonIndex > 0) 
      {
        const key = comment.substring(0, colonIndex).trim();
        const value = comment.substring(colonIndex + 1).trim();
        metadata[key] = value;
      }
    });

    // File creation date
    if (this.header.fileCreated) 
    {
      metadata["File Created"] = this.header.fileCreated.replace("File created on ", "");
    }

    // Overall stats
    metadata["Total Points"] = this.rows.length.toString();
    metadata["Laps"] = this._laps.length.toString();

    return metadata;
  }

  /**
   * Create model from legacy format (for backward compatibility)
   */
  static fromLegacyFormat(data: {
    header: VBOHeader;
    rows: VBODataRow[];
    boundingBox: BoundingBox;
    startFinish?: StartFinishLine;
    laps: Array<{
      index: number;
      startIdx: number;
      endIdx: number;
      rows: VBODataRow[];
    }>;
  }): VBOData 
  {
    // Convert legacy Lap to LapData
    const laps = data.laps.map(
      (lap, index) =>
        new LapData(
          lap.index,
          lap.rows,
          getLapColor(index),
          lap.startIdx,
          lap.endIdx,
          data.rows, // Pass source array
        ),
    );

    return new VBOData(data.header, data.rows, data.boundingBox, data.startFinish, laps);
  }
}

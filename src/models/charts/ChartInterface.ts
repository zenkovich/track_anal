/**
 * Interface for lap comparison charts
 */

import { LapData } from "../LapData";

/**
 * Chart data point
 */
export interface ChartDataPoint {
  distance: number; // Distance from lap start (m)
  value: number; // Parameter value
  /** Time from lap start (ms) */
  time: number;
  /** Normalized 0..1: distance / totalLapDistance */
  normalized: number;
  /** Sector boundary index (0..2): point is on boundary between sector N and N+1 */
  sectorBoundaryIndex?: number;
}

/** Projection mode: how to convert normalized chart position to track projection */
export type ChartProjectionMode = "distance" | "time" | "normalized";

/** Canonical X from fastest lap - used to project onto all laps */
export interface CanonicalX {
  distance: number;
  timeMs: number;
  normalized: number;
}

/** Shared projection: from chart (normalized) or from track (canonical X from fastest lap) */
export type Projection =
  | { type: "chart"; normalized: number; mouseX: number }
  | { type: "track"; canonical: CanonicalX }
  | null;

/**
 * Chart interface
 */
export interface IChart {
  /** Chart name */
  readonly name: string;

  /** Unit of measurement */
  readonly unit: string;

  /** Chart data points */
  readonly points: ChartDataPoint[];

  /** Whether reference lap is required for calculation */
  readonly needsReference: boolean;

  /**
   * Higher is better?
   * true: higher values = better (green delta for positive)
   * false: lower values = better (green delta for negative)
   */
  readonly higherIsBetter: boolean;

  /**
   * Calculate chart for a lap
   * @param lap Lap to calculate
   * @param referenceLap Reference lap (optional, for deltas)
   */
  calculate(lap: LapData, referenceLap?: LapData): void;

  /**
   * Get minimum Y value
   */
  getMinValue(): number;

  /**
   * Get maximum Y value
   */
  getMaxValue(): number;

  /**
   * Get value at distance (with interpolation)
   */
  getValueAtDistance(distance: number): number | null;

  /**
   * Get value at time (with interpolation)
   */
  getValueAtTime(timeMs: number): number | null;

  /**
   * Get value at normalized position 0..1 (with interpolation)
   */
  getValueAtNormalized(normalized: number): number | null;

  /** Total lap distance (m) - for cursor conversion */
  getTotalDistance(): number;

  /** Total lap time (ms) - for cursor conversion */
  getTotalTime(): number;
}

/**
 * Base abstract class for charts
 */
export abstract class BaseChart implements IChart 
{
  abstract readonly name: string;
  abstract readonly unit: string;
  readonly needsReference: boolean = false;
  abstract readonly higherIsBetter: boolean;

  points: ChartDataPoint[] = [];

  abstract calculate(lap: LapData, referenceLap?: LapData): void;

  getMinValue(): number 
  {
    if (this.points.length === 0) return 0;
    return Math.min(...this.points.map((p) => p.value));
  }

  getMaxValue(): number 
  {
    if (this.points.length === 0) return 0;
    return Math.max(...this.points.map((p) => p.value));
  }

  getValueAtDistance(distance: number): number | null 
  {
    if (this.points.length === 0) return null;
    for (let i = 1; i < this.points.length; i++) 
    {
      const p1 = this.points[i - 1];
      const p2 = this.points[i];
      if (distance >= p1.distance && distance <= p2.distance) 
      {
        const t = (distance - p1.distance) / (p2.distance - p1.distance || 0.001);
        return p1.value + t * (p2.value - p1.value);
      }
    }
    return null;
  }

  getValueAtTime(timeMs: number): number | null 
  {
    if (this.points.length === 0) return null;
    for (let i = 1; i < this.points.length; i++) 
    {
      const p1 = this.points[i - 1];
      const p2 = this.points[i];
      if (timeMs >= p1.time && timeMs <= p2.time) 
      {
        const t = (timeMs - p1.time) / (p2.time - p1.time || 0.001);
        return p1.value + t * (p2.value - p1.value);
      }
    }
    return null;
  }

  getValueAtNormalized(normalized: number): number | null 
  {
    if (this.points.length === 0) return null;
    for (let i = 1; i < this.points.length; i++) 
    {
      const p1 = this.points[i - 1];
      const p2 = this.points[i];
      if (normalized >= p1.normalized && normalized <= p2.normalized) 
      {
        const t = (normalized - p1.normalized) / (p2.normalized - p1.normalized || 0.001);
        return p1.value + t * (p2.value - p1.value);
      }
    }
    return null;
  }

  getTotalDistance(): number 
  {
    if (this.points.length === 0) return 0;
    return this.points[this.points.length - 1].distance;
  }

  getTotalTime(): number 
  {
    if (this.points.length === 0) return 0;
    return this.points[this.points.length - 1].time;
  }
}

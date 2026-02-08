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
}

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
   * @param distance Distance from lap start (m)
   */
  getValueAtDistance(distance: number): number | null;
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

    // Find nearest points for interpolation
    for (let i = 1; i < this.points.length; i++) 
    {
      const p1 = this.points[i - 1];
      const p2 = this.points[i];

      if (distance >= p1.distance && distance <= p2.distance) 
      {
        // Linear interpolation
        const t = (distance - p1.distance) / (p2.distance - p1.distance);
        return p1.value + t * (p2.value - p1.value);
      }
    }

    return null;
  }
}

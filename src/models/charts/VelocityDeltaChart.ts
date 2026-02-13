/**
 * Velocity delta chart vs reference lap
 */

import { BaseChart } from "./ChartInterface";
import { LapData } from "../LapData";

export class VelocityDeltaChart extends BaseChart 
{
  readonly name = "Velocity Delta";
  readonly unit = "km/h";
  readonly needsReference = true;
  readonly higherIsBetter = true; // Higher delta (positive) = faster = better

  calculate(lap: LapData, referenceLap?: LapData): void 
  {
    this.points = [];

    if (!referenceLap) 
    {
      // No reference lap - chart is empty
      return;
    }

    // For each point of current lap find velocity delta
    lap.rows.forEach((row) => 
    {
      if (row.lapDistanceFromStart === undefined) 
      {
        return;
      }

      // Get velocity in reference lap at same distance
      const refChart = referenceLap.getChart("velocity");
      if (!refChart) return;

      const refVelocity = refChart.getValueAtDistance(row.lapDistanceFromStart);
      if (refVelocity === null) return;

      // Compute delta (km/h)
      const delta = row.velocity - refVelocity;

      const lastRow = lap.rows[lap.rows.length - 1];
      const totalDistance = lastRow?.lapDistanceFromStart ?? 0;
      const dist = row.lapDistanceFromStart;
      const timeMs = row.lapTimeFromStart ?? 0;
      const normalized = totalDistance > 0 ? dist / totalDistance : 0;

      this.points.push({
        distance: dist,
        value: delta,
        time: timeMs,
        normalized,
        sectorBoundaryIndex: row.sectorBoundaryIndex,
      });
    });
  }
}

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

      this.points.push({
        distance: row.lapDistanceFromStart,
        value: delta,
      });
    });
  }
}

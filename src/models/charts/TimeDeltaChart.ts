/**
 * Time delta chart vs reference lap
 */

import { BaseChart } from "./ChartInterface";
import { LapData } from "../LapData";

export class TimeDeltaChart extends BaseChart 
{
  readonly name = "Time Delta";
  readonly unit = "s";
  readonly needsReference = true;
  readonly higherIsBetter = false; // Lower delta (negative) = faster = better

  calculate(lap: LapData, referenceLap?: LapData): void 
  {
    this.points = [];

    if (!referenceLap) 
    {
      // No reference lap - chart is empty
      return;
    }

    // For each point of current lap find time delta
    lap.rows.forEach((row) => 
    {
      if (row.lapDistanceFromStart === undefined || row.lapTimeFromStart === undefined) 
      {
        return;
      }

      // Get time in reference lap at same distance
      const refChart = referenceLap.getChart("time");
      if (!refChart) return;

      const refTime = refChart.getValueAtDistance(row.lapDistanceFromStart);
      if (refTime === null) return;

      // Compute delta (seconds)
      const currentTime = row.lapTimeFromStart / 1000;
      const delta = currentTime - refTime;

      this.points.push({
        distance: row.lapDistanceFromStart,
        value: delta,
      });
    });
  }
}

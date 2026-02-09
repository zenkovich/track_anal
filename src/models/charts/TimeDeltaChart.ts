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

    const refPoints = referenceLap.rows
      .filter(
        (row) => row.lapDistanceFromStart !== undefined && row.lapTimeFromStart !== undefined,
      )
      .map((row) => ({
        distance: row.lapDistanceFromStart as number,
        time: (row.lapTimeFromStart as number) / 1000,
      }));

    if (refPoints.length < 2) 
    {
      return;
    }

    let refIndex = 1;

    // For each point of current lap find time delta
    lap.rows.forEach((row) => 
    {
      if (row.lapDistanceFromStart === undefined || row.lapTimeFromStart === undefined) 
      {
        return;
      }

      const distance = row.lapDistanceFromStart;

      while (refIndex < refPoints.length && refPoints[refIndex].distance < distance) 
      {
        refIndex += 1;
      }

      if (refIndex === 0 || refIndex >= refPoints.length) 
      {
        return;
      }

      const p1 = refPoints[refIndex - 1];
      const p2 = refPoints[refIndex];

      if (distance < p1.distance || distance > p2.distance) 
      {
        return;
      }

      const t =
        p2.distance === p1.distance ? 0 : (distance - p1.distance) / (p2.distance - p1.distance);
      const refTime = p1.time + t * (p2.time - p1.time);

      // Compute delta (seconds)
      const currentTime = row.lapTimeFromStart / 1000;
      const delta = currentTime - refTime;

      this.points.push({
        distance,
        value: delta,
      });
    });
  }
}

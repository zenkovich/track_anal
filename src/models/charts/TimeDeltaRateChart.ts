/**
 * Time delta rate chart: derivative of time delta vs reference lap (d(Δt)/d(segment))
 * Shows where time is gained or lost most rapidly
 */

import { BaseChart } from "./ChartInterface";
import { LapData } from "../LapData";

export class TimeDeltaRateChart extends BaseChart 
{
  readonly name = "Time Δ rate";
  readonly unit = "s";
  readonly needsReference = true;
  readonly higherIsBetter = false; // Negative rate = gaining time = better

  calculate(lap: LapData, referenceLap?: LapData): void 
  {
    this.points = [];

    if (!referenceLap) 
    {
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
    const timeDeltas: { distance: number; delta: number; timeMs: number; normalized: number; sectorBoundaryIndex?: number }[] = [];

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

      const currentTime = row.lapTimeFromStart / 1000;
      const delta = currentTime - refTime;

      const lastRow = lap.rows[lap.rows.length - 1];
      const totalDistance = lastRow?.lapDistanceFromStart ?? 0;
      const timeMs = row.lapTimeFromStart ?? 0;
      const normalized = totalDistance > 0 ? distance / totalDistance : 0;

      timeDeltas.push({
        distance,
        delta,
        timeMs,
        normalized,
        sectorBoundaryIndex: row.sectorBoundaryIndex,
      });
    });

    // Compute rate of change: d(delta)/d(segment)
    for (let i = 0; i < timeDeltas.length; i++) 
    {
      const prev = i > 0 ? timeDeltas[i - 1].delta : 0;
      const rate = timeDeltas[i].delta - prev;

      this.points.push({
        distance: timeDeltas[i].distance,
        value: rate,
        time: timeDeltas[i].timeMs,
        normalized: timeDeltas[i].normalized,
        sectorBoundaryIndex: timeDeltas[i].sectorBoundaryIndex,
      });
    }
  }
}

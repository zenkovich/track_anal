/**
 * Velocity chart
 */

import { BaseChart } from "./ChartInterface";
import { LapData } from "../LapData";

export class VelocityChart extends BaseChart 
{
  readonly name = "Velocity";
  readonly unit = "km/h";
  readonly needsReference = false;
  readonly higherIsBetter = true; // Higher speed = better

  calculate(lap: LapData): void 
  {
    this.points = [];
    const lastRow = lap.rows[lap.rows.length - 1];
    const totalDistance = lastRow?.lapDistanceFromStart ?? 0;

    lap.rows.forEach((row) => 
    {
      if (row.lapDistanceFromStart !== undefined) 
      {
        const dist = row.lapDistanceFromStart;
        const time = row.lapTimeFromStart ?? 0;
        const normalized = totalDistance > 0 ? dist / totalDistance : 0;

        this.points.push({
          distance: dist,
          value: row.velocity,
          time,
          normalized,
          sectorBoundaryIndex: row.sectorBoundaryIndex,
        });
      }
    });
  }
}

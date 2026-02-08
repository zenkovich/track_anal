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

    // Create chart point for each lap point
    lap.rows.forEach((row) => 
    {
      if (row.lapDistanceFromStart !== undefined) 
      {
        this.points.push({
          distance: row.lapDistanceFromStart,
          value: row.velocity,
        });
      }
    });
  }
}

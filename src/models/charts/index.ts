/**
 * Registration of all chart types
 */

import { IChart } from "./ChartInterface";
import { VelocityChart } from "./VelocityChart";
import { TimeDeltaChart } from "./TimeDeltaChart";
import { VelocityDeltaChart } from "./VelocityDeltaChart";
import { TimeDeltaRateChart } from "./TimeDeltaRateChart";

export * from "./ChartInterface";
export * from "./VelocityChart";
export * from "./TimeDeltaChart";
export * from "./VelocityDeltaChart";
export * from "./TimeDeltaRateChart";

/**
 * Chart types
 */
export type ChartType = "velocity" | "timedelta" | "velocitydelta" | "timedeltarate";

/**
 * Chart type description
 */
export interface ChartTypeInfo {
  type: ChartType;
  name: string;
  icon: string; // Icon component name
  createInstance: () => IChart;
}

/**
 * Registry of all available chart types
 */
export const CHART_TYPES: ChartTypeInfo[] = [
  {
    type: "velocity",
    name: "Velocity",
    icon: "VelocityIcon",
    createInstance: () => new VelocityChart(),
  },
  {
    type: "timedelta",
    name: "Time Δ",
    icon: "TimeDeltaIcon",
    createInstance: () => new TimeDeltaChart(),
  },
  {
    type: "velocitydelta",
    name: "Velocity Δ",
    icon: "VelocityDeltaIcon",
    createInstance: () => new VelocityDeltaChart(),
  },
  {
    type: "timedeltarate",
    name: "Time Δ rate",
    icon: "TimeDeltaRateIcon",
    createInstance: () => new TimeDeltaRateChart(),
  },
];

/**
 * Create chart by type
 */
export function createChart(type: ChartType): IChart 
{
  const chartType = CHART_TYPES.find((ct) => ct.type === type);
  if (!chartType) 
  {
    throw new Error(`Unknown chart type: ${type}`);
  }
  return chartType.createInstance();
}

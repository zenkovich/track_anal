/**
 * Регистрация всех типов графиков
 */

import { IChart } from './ChartInterface'
import { VelocityChart } from './VelocityChart'
import { TimeChart } from './TimeChart'
import { TimeDeltaChart } from './TimeDeltaChart'
import { VelocityDeltaChart } from './VelocityDeltaChart'

export * from './ChartInterface'
export * from './VelocityChart'
export * from './TimeChart'
export * from './TimeDeltaChart'
export * from './VelocityDeltaChart'

/**
 * Типы графиков
 */
export type ChartType = 'velocity' | 'time' | 'timedelta' | 'velocitydelta'

/**
 * Описание типа графика
 */
export interface ChartTypeInfo {
  type: ChartType
  name: string
  icon: string // Название компонента иконки
  createInstance: () => IChart
}

/**
 * Реестр всех доступных типов графиков
 */
export const CHART_TYPES: ChartTypeInfo[] = [
  {
    type: 'velocity',
    name: 'Velocity',
    icon: 'VelocityIcon',
    createInstance: () => new VelocityChart()
  },
  {
    type: 'time',
    name: 'Time',
    icon: 'TimeIcon',
    createInstance: () => new TimeChart()
  },
  {
    type: 'timedelta',
    name: 'Time Δ',
    icon: 'TimeDeltaIcon',
    createInstance: () => new TimeDeltaChart()
  },
  {
    type: 'velocitydelta',
    name: 'Velocity Δ',
    icon: 'VelocityDeltaIcon',
    createInstance: () => new VelocityDeltaChart()
  }
]

/**
 * Создает график по типу
 */
export function createChart(type: ChartType): IChart {
  const chartType = CHART_TYPES.find(ct => ct.type === type)
  if (!chartType) {
    throw new Error(`Unknown chart type: ${type}`)
  }
  return chartType.createInstance()
}

/**
 * Регистрация всех типов графиков
 */

import { IChart } from './ChartInterface'
import { VelocityChart } from './VelocityChart'
import { TimeChart } from './TimeChart'

export * from './ChartInterface'
export * from './VelocityChart'
export * from './TimeChart'

/**
 * Типы графиков
 */
export type ChartType = 'velocity' | 'time'

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

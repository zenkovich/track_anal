/**
 * График дельты скорости относительно референсного круга
 */

import { BaseChart } from './ChartInterface'
import { LapData } from '../LapData'

export class VelocityDeltaChart extends BaseChart {
  readonly name = 'Velocity Delta'
  readonly unit = 'km/h'
  readonly needsReference = true
  
  calculate(lap: LapData, referenceLap?: LapData): void {
    this.points = []
    
    if (!referenceLap) {
      // Нет референсного круга - график пустой
      return
    }
    
    // Для каждой точки текущего круга находим дельту скорости
    lap.rows.forEach(row => {
      if (row.lapDistanceFromStart === undefined) {
        return
      }
      
      // Получаем скорость в референсном круге на той же дистанции
      const refChart = referenceLap.getChart('velocity')
      if (!refChart) return
      
      const refVelocity = refChart.getValueAtDistance(row.lapDistanceFromStart)
      if (refVelocity === null) return
      
      // Вычисляем дельту (км/ч)
      const delta = row.velocity - refVelocity
      
      this.points.push({
        distance: row.lapDistanceFromStart,
        value: delta
      })
    })
  }
}

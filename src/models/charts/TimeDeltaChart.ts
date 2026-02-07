/**
 * График дельты времени относительно референсного круга
 */

import { BaseChart } from './ChartInterface'
import { LapData } from '../LapData'

export class TimeDeltaChart extends BaseChart {
  readonly name = 'Time Delta'
  readonly unit = 's'
  readonly needsReference = true
  
  calculate(lap: LapData, referenceLap?: LapData): void {
    this.points = []
    
    if (!referenceLap) {
      // Нет референсного круга - график пустой
      return
    }
    
    // Для каждой точки текущего круга находим дельту времени
    lap.rows.forEach(row => {
      if (row.lapDistanceFromStart === undefined || row.lapTimeFromStart === undefined) {
        return
      }
      
      // Получаем время в референсном круге на той же дистанции
      const refChart = referenceLap.getChart('time')
      if (!refChart) return
      
      const refTime = refChart.getValueAtDistance(row.lapDistanceFromStart)
      if (refTime === null) return
      
      // Вычисляем дельту (секунды)
      const currentTime = row.lapTimeFromStart / 1000
      const delta = currentTime - refTime
      
      this.points.push({
        distance: row.lapDistanceFromStart,
        value: delta
      })
    })
  }
}

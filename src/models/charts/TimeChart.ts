/**
 * График времени относительно дистанции
 */

import { BaseChart } from './ChartInterface'
import { LapData } from '../LapData'

export class TimeChart extends BaseChart {
  readonly name = 'Time'
  readonly unit = 's'
  
  calculate(lap: LapData): void {
    this.points = []
    
    // Для каждой точки круга создаем точку графика
    lap.rows.forEach(row => {
      if (row.lapDistanceFromStart !== undefined && row.lapTimeFromStart !== undefined) {
        this.points.push({
          distance: row.lapDistanceFromStart,
          value: row.lapTimeFromStart / 1000 // Конвертируем мс в секунды
        })
      }
    })
  }
}

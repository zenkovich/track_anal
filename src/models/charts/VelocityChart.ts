/**
 * График скорости
 */

import { BaseChart } from './ChartInterface'
import { LapData } from '../LapData'

export class VelocityChart extends BaseChart {
  readonly name = 'Velocity'
  readonly unit = 'km/h'
  
  calculate(lap: LapData): void {
    this.points = []
    
    // Для каждой точки круга создаем точку графика
    lap.rows.forEach(row => {
      if (row.lapDistanceFromStart !== undefined) {
        this.points.push({
          distance: row.lapDistanceFromStart,
          value: row.velocity
        })
      }
    })
  }
}

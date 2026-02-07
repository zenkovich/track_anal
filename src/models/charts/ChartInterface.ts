/**
 * Интерфейс для графиков сравнения кругов
 */

import { LapData } from '../LapData'

/**
 * Точка данных графика
 */
export interface ChartDataPoint {
  distance: number  // Дистанция от начала круга (м)
  value: number     // Значение параметра
}

/**
 * Интерфейс графика
 */
export interface IChart {
  /** Название графика */
  readonly name: string
  
  /** Единицы измерения */
  readonly unit: string
  
  /** Точки данных графика */
  readonly points: ChartDataPoint[]
  
  /** Требуется ли референсный круг для расчета */
  readonly needsReference: boolean
  
  /** 
   * Больше значит лучше?
   * true: большие значения = лучше (зеленая дельта для положительных)
   * false: меньшие значения = лучше (зеленая дельта для отрицательных)
   */
  readonly higherIsBetter: boolean
  
  /**
   * Рассчитывает график для круга
   * @param lap Круг для расчета
   * @param referenceLap Референсный круг (опционально, для дельт)
   */
  calculate(lap: LapData, referenceLap?: LapData): void
  
  /**
   * Получает минимальное значение Y
   */
  getMinValue(): number
  
  /**
   * Получает максимальное значение Y
   */
  getMaxValue(): number
  
  /**
   * Получает значение в точке по дистанции (с интерполяцией)
   * @param distance Дистанция от начала круга (м)
   */
  getValueAtDistance(distance: number): number | null
}

/**
 * Базовый абстрактный класс для графиков
 */
export abstract class BaseChart implements IChart {
  abstract readonly name: string
  abstract readonly unit: string
  readonly needsReference: boolean = false
  abstract readonly higherIsBetter: boolean
  
  points: ChartDataPoint[] = []
  
  abstract calculate(lap: LapData, referenceLap?: LapData): void
  
  getMinValue(): number {
    if (this.points.length === 0) return 0
    return Math.min(...this.points.map(p => p.value))
  }
  
  getMaxValue(): number {
    if (this.points.length === 0) return 0
    return Math.max(...this.points.map(p => p.value))
  }
  
  getValueAtDistance(distance: number): number | null {
    if (this.points.length === 0) return null
    
    // Находим ближайшие точки для интерполяции
    for (let i = 1; i < this.points.length; i++) {
      const p1 = this.points[i - 1]
      const p2 = this.points[i]
      
      if (distance >= p1.distance && distance <= p2.distance) {
        // Линейная интерполяция
        const t = (distance - p1.distance) / (p2.distance - p1.distance)
        return p1.value + t * (p2.value - p1.value)
      }
    }
    
    return null
  }
}

/**
 * Модель данных круга (Lap) с параметрами и видимостью
 */

import { VBODataRow } from './types'

/**
 * Статистика круга
 */
export interface LapStats {
  name: string          // Имя круга (например, "Lap 1")
  distance: number      // Дистанция (метры)
  time: number          // Время (миллисекунды)
  maxSpeed: number      // Максимальная скорость (км/ч)
  timeFormatted: string // Время в формате MM:SS.mmm
}

/**
 * Данные одного круга с точками и параметрами
 */
export class LapData {
  /** Индекс круга (0-based) */
  readonly index: number
  
  /** Точки трека этого круга */
  readonly rows: VBODataRow[]
  
  /** Видимость круга на карте */
  visible: boolean = true
  
  /** Цвет круга */
  readonly color: string
  
  /** Индексы в исходном массиве для расчета времени */
  readonly startIdx: number
  readonly endIdx: number
  
  /** Ссылка на исходный массив всех точек (для расчета времени) */
  private readonly allRows?: VBODataRow[]

  constructor(
    index: number,
    rows: VBODataRow[],
    color: string,
    startIdx: number = 0,
    endIdx: number = 0,
    allRows?: VBODataRow[]
  ) {
    this.index = index
    this.rows = rows
    this.color = color
    this.startIdx = startIdx
    this.endIdx = endIdx
    this.allRows = allRows
    
    // Инициализируем время и дистанцию от начала круга для каждой точки
    this.initializeLapParameters()
  }
  
  /**
   * Инициализирует параметры времени и дистанции от начала круга для каждой точки
   */
  private initializeLapParameters(): void {
    if (this.rows.length === 0) return
    
    const firstRow = this.rows[0]
    const startTime = this.parseTime(firstRow.time)
    let cumulativeDistance = 0
    
    // Debug первой точки
    console.log(`[Lap ${this.index}] Init: first time="${firstRow.time}", parsed=${startTime}ms, isInterpolated=${firstRow.isInterpolated}`)
    
    this.rows.forEach((row, idx) => {
      // Время от начала круга (всегда относительно первой точки ЭТОГО круга)
      const rowTime = this.parseTime(row.time)
      row.lapTimeFromStart = rowTime - startTime
      
      // Дистанция от начала круга
      if (idx > 0 && row.distance) {
        cumulativeDistance += row.distance
      }
      row.lapDistanceFromStart = cumulativeDistance
      
      // Debug нескольких точек для первых двух кругов
      if (this.index <= 1 && (idx === 0 || idx === Math.floor(this.rows.length / 2) || idx === this.rows.length - 1)) {
        console.log(`  [${idx}] time="${row.time}", lapTimeFromStart=${row.lapTimeFromStart}ms (${(row.lapTimeFromStart/1000).toFixed(2)}s), dist=${row.lapDistanceFromStart?.toFixed(1)}m`)
      }
    })
    
    // Debug для первых двух кругов
    if (this.index <= 1 && this.rows.length > 1) {
      console.log(`[Lap ${this.index}] Summary:`)
      const lastRow = this.rows[this.rows.length-1]
      console.log(`  Total time: ${lastRow.lapTimeFromStart}ms (${(lastRow.lapTimeFromStart! / 1000).toFixed(2)}s)`)
      console.log(`  Total distance: ${lastRow.lapDistanceFromStart?.toFixed(1)}m`)
    }
  }

  /**
   * Вычисляет статистику круга
   */
  getStats(): LapStats {
    // Расчет дистанции (сумма всех distance)
    let distance = 0
    for (const row of this.rows) {
      if (row.distance) {
        distance += row.distance
      }
    }

    // Расчет времени (разница между первой и последней точкой)
    const timeMs = this.calculateTimeMs()

    // Максимальная скорость
    let maxSpeed = 0
    for (const row of this.rows) {
      if (row.velocity > maxSpeed) {
        maxSpeed = row.velocity
      }
    }

    return {
      name: `Lap ${this.index + 1}`,
      distance: Math.round(distance),
      time: timeMs,
      maxSpeed: Math.round(maxSpeed),
      timeFormatted: this.formatTime(timeMs)
    }
  }

  /**
   * Вычисляет время круга в миллисекундах
   */
  private calculateTimeMs(): number {
    // Если есть исходный массив и индексы, используем их
    if (this.allRows && this.startIdx >= 0 && this.endIdx > this.startIdx) {
      const firstTimeStr = this.allRows[this.startIdx]?.time
      const lastTimeStr = this.allRows[this.endIdx]?.time
      
      if (firstTimeStr && lastTimeStr) {
        const firstTime = this.parseTime(firstTimeStr)
        const lastTime = this.parseTime(lastTimeStr)
        return Math.max(0, lastTime - firstTime)
      }
    }
    
    // Fallback: используем первую и последнюю точку круга
    if (this.rows.length < 2) return 0

    const firstTimeStr = this.rows[0].time
    const lastTimeStr = this.rows[this.rows.length - 1].time
    
    const firstTime = this.parseTime(firstTimeStr)
    const lastTime = this.parseTime(lastTimeStr)
    
    return Math.max(0, lastTime - firstTime)
  }

  /**
   * Парсит время из строки формата HH:MM:SS.mmm в миллисекунды
   */
  private parseTime(timeStr: string): number {
    if (!timeStr) return 0
    
    const parts = timeStr.split(':')
    if (parts.length !== 3) return 0

    const hh = parseInt(parts[0], 10)
    const mm = parseInt(parts[1], 10)
    const ss = parseFloat(parts[2])

    if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return 0

    return (hh * 3600 + mm * 60 + ss) * 1000
  }

  /**
   * Форматирует миллисекунды в строку M:SS.mmm (как в таблице)
   */
  private formatTime(ms: number): string {
    if (isNaN(ms) || ms < 0) return '0:00.000'
    
    const totalSeconds = ms / 1000
    const minutes = Math.floor(totalSeconds / 60)
    const secondsRemainder = totalSeconds - (minutes * 60)
    const secWhole = Math.floor(secondsRemainder)
    const secFrac = Math.floor((secondsRemainder - secWhole) * 1000)

    return `${minutes}:${secWhole.toString().padStart(2, '0')}.${secFrac.toString().padStart(3, '0')}`
  }

  /**
   * Переключает видимость круга
   */
  toggleVisibility(): void {
    this.visible = !this.visible
  }

  /**
   * Устанавливает видимость круга
   */
  setVisibility(visible: boolean): void {
    this.visible = visible
  }
}

/**
 * Палитра цветов для кругов (яркие, различимые цвета)
 */
export const LAP_COLORS = [
  '#FF6B00', // ярко-оранжевый
  '#00FFD1', // неоновый циан
  '#FF0080', // неоновый розовый
  '#FFD700', // золотой
  '#7FFF00', // неоновый лайм
  '#FF1493', // глубокий розовый
  '#00E5FF', // яркий голубой
  '#FFB000', // янтарный
  '#B026FF', // неоновый фиолетовый
  '#00FF7F', // весенний зеленый
  '#FF4500', // огненный оранжевый
  '#39FF14', // неоновый зеленый
  '#FF69B4', // горячий розовый
  '#00BFFF', // глубокий небесно-голубой
  '#FFAA00', // оранжево-желтый
  '#DA70D6', // орхидея
]

/**
 * Получает цвет для круга по индексу
 */
export function getLapColor(lapIndex: number): string {
  return LAP_COLORS[lapIndex % LAP_COLORS.length]
}

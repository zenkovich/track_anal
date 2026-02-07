/**
 * Модель данных VBO файла
 */

import { VBOHeader, VBODataRow, BoundingBox, StartFinishLine } from './types'
import { LapData, getLapColor } from './LapData'

/**
 * Основной класс данных VBO файла со всеми треками и кругами
 */
export class VBOData {
  /** Заголовок файла с метаданными */
  readonly header: VBOHeader
  
  /** Все точки трека */
  readonly rows: VBODataRow[]
  
  /** Границы трека (bounding box) */
  readonly boundingBox: BoundingBox
  
  /** Линия старт/финиш (если определена) */
  readonly startFinish?: StartFinishLine
  
  /** 
   * Круги трека с параметрами и видимостью
   * 
   * ВАЖНО: Видимость кругов (lap.visible) - это общее состояние для всего приложения
   * Все компоненты используют это состояние:
   * - LapsPanel: чекбоксы управляют lap.visible
   * - TrackVisualizer: отрисовывает только круги с lap.visible=true
   * - ChartsPanel: отображает графики только для кругов с lap.visible=true
   * - Tooltip: показывает данные только для кругов с lap.visible=true
   */
  private _laps: LapData[]

  constructor(
    header: VBOHeader,
    rows: VBODataRow[],
    boundingBox: BoundingBox,
    startFinish?: StartFinishLine,
    laps: LapData[] = []
  ) {
    this.header = header
    this.rows = rows
    this.boundingBox = boundingBox
    this.startFinish = startFinish
    this._laps = laps
  }

  /**
   * Получает все круги
   */
  get laps(): LapData[] {
    return this._laps
  }

  /**
   * Устанавливает круги (используется парсером)
   */
  setLaps(laps: LapData[]): void {
    this._laps = laps
  }

  /**
   * Получает видимые круги
   */
  getVisibleLaps(): LapData[] {
    return this._laps.filter(lap => lap.visible)
  }

  /**
   * Находит самый быстрый круг среди видимых
   * @returns Индекс самого быстрого круга или null если нет видимых
   */
  getFastestVisibleLap(): number | null {
    const visibleLaps = this.getVisibleLaps()
    if (visibleLaps.length === 0) return null
    
    let fastestLap = visibleLaps[0]
    let fastestTime = fastestLap.getStats().time
    
    for (const lap of visibleLaps) {
      const stats = lap.getStats()
      if (stats.time > 0 && stats.time < fastestTime) {
        fastestTime = stats.time
        fastestLap = lap
      }
    }
    
    return fastestLap.index
  }

  /**
   * Вычисляет медиану времен кругов
   */
  private getMedianTime(): number | null {
    const times = this._laps
      .map(l => l.getStats().time)
      .filter(time => time > 0)
      .sort((a, b) => a - b)
    
    if (times.length === 0) return null
    
    const mid = Math.floor(times.length / 2)
    if (times.length % 2 === 0) {
      return (times[mid - 1] + times[mid]) / 2
    } else {
      return times[mid]
    }
  }

  /**
   * Определяет является ли круг аномальным (outlier)
   * На основе отклонения от медианы
   * @param lapIndex Индекс круга
   * @param tolerancePercent Допустимое отклонение от медианы в процентах (по умолчанию 15%)
   * @returns true если круг аномальный
   */
  isOutlier(lapIndex: number, tolerancePercent: number = 15): boolean {
    const lap = this._laps[lapIndex]
    if (!lap) return false
    
    if (this._laps.length < 3) return false
    
    const median = this.getMedianTime()
    if (median === null) return false
    
    const lapTime = lap.getStats().time
    if (lapTime <= 0) return false
    
    // Вычисляем допустимый диапазон
    const tolerance = median * (tolerancePercent / 100)
    const minTime = median - tolerance
    const maxTime = median + tolerance
    
    return lapTime < minTime || lapTime > maxTime
  }

  /**
   * Применяет эвристику для автоматической фильтрации кругов
   * Скрывает круги которые отличаются от медианы более чем на tolerancePercent
   * @param tolerancePercent Допустимое отклонение от медианы в процентах (по умолчанию 15%)
   */
  applyTimeHeuristics(tolerancePercent: number = 15): void {
    if (this._laps.length < 3) return
    
    const median = this.getMedianTime()
    if (median === null) return
    
    const tolerance = median * (tolerancePercent / 100)
    const minTime = median - tolerance
    const maxTime = median + tolerance
    
    console.log(`[Heuristics] Total laps: ${this._laps.length}`)
    console.log(`[Heuristics] Median time: ${(median / 1000).toFixed(2)}s`)
    console.log(`[Heuristics] Tolerance: ±${tolerancePercent}% (±${(tolerance / 1000).toFixed(2)}s)`)
    console.log(`[Heuristics] Valid range: ${(minTime / 1000).toFixed(2)}s - ${(maxTime / 1000).toFixed(2)}s`)
    
    // Скрываем круги вне диапазона
    let hiddenCount = 0
    this._laps.forEach(lap => {
      const stats = lap.getStats()
      if (stats.time > 0 && (stats.time < minTime || stats.time > maxTime)) {
        lap.setVisibility(false)
        hiddenCount++
      }
    })
    
    console.log(`[Heuristics] Hidden ${hiddenCount} outlier laps`)
  }

  /**
   * Получает индексы видимых кругов (для обратной совместимости)
   */
  getVisibleLapIndices(): Set<number> {
    return new Set(
      this._laps
        .filter(lap => lap.visible)
        .map(lap => lap.index)
    )
  }

  /**
   * Переключает видимость круга по индексу
   */
  toggleLapVisibility(lapIndex: number): void {
    const lap = this._laps[lapIndex]
    if (lap) {
      lap.toggleVisibility()
      // Пересчитываем графики при изменении видимости (может измениться лучший круг)
      this.recalculateChartsForAllLaps()
    }
  }
  
  /**
   * Пересчитывает графики для всех кругов (при изменении лучшего круга)
   */
  recalculateChartsForAllLaps(): void {
    const fastestLapIndex = this.getFastestVisibleLap()
    const referenceLap = fastestLapIndex !== null ? this._laps[fastestLapIndex] : undefined
    
    this._laps.forEach(lap => {
      lap.recalculateCharts(referenceLap)
    })
  }

  /**
   * Показывает/скрывает все круги
   */
  setAllLapsVisibility(visible: boolean): void {
    this._laps.forEach(lap => lap.setVisibility(visible))
    // Пересчитываем графики при массовом изменении
    this.recalculateChartsForAllLaps()
  }

  /**
   * Получает метаданные файла
   */
  getMetadata(): Record<string, string> {
    const metadata: Record<string, string> = {}

    // Парсим комментарии
    this.header.comments.forEach(comment => {
      const colonIndex = comment.indexOf(':')
      if (colonIndex > 0) {
        const key = comment.substring(0, colonIndex).trim()
        const value = comment.substring(colonIndex + 1).trim()
        metadata[key] = value
      }
    })

    // Дата создания файла
    if (this.header.fileCreated) {
      metadata['File Created'] = this.header.fileCreated.replace('File created on ', '')
    }

    // Общая статистика
    metadata['Total Points'] = this.rows.length.toString()
    metadata['Laps'] = this._laps.length.toString()

    return metadata
  }

  /**
   * Получает модель файла из устаревшего формата (для обратной совместимости)
   */
  static fromLegacyFormat(data: {
    header: VBOHeader
    rows: VBODataRow[]
    boundingBox: BoundingBox
    startFinish?: StartFinishLine
    laps: Array<{
      index: number
      startIdx: number
      endIdx: number
      rows: VBODataRow[]
    }>
  }): VBOData {
    // Преобразуем старые Lap в LapData
    const laps = data.laps.map((lap, index) => 
      new LapData(
        lap.index,
        lap.rows,
        getLapColor(index),
        lap.startIdx,
        lap.endIdx,
        data.rows // Передаем исходный массив
      )
    )

    return new VBOData(
      data.header,
      data.rows,
      data.boundingBox,
      data.startFinish,
      laps
    )
  }
}

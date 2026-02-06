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
  
  /** Круги трека с параметрами и видимостью */
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
    }
  }

  /**
   * Показывает/скрывает все круги
   */
  setAllLapsVisibility(visible: boolean): void {
    this._laps.forEach(lap => lap.setVisibility(visible))
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

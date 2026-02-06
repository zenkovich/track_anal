/**
 * Парсер VBO файлов (формат dragy)
 * 
 * Основная логика:
 * 1. Парсинг заголовка и данных из текстового файла
 * 2. Конвертация координат VBO -> GPS -> метры
 * 3. Вычисление производных параметров (скорость, направление)
 * 4. Определение линии старт/финиш
 * 5. Разделение на круги
 */

import { VBOHeader, VBODataRow, BoundingBox, StartFinishLine } from '../models/types'
import { VBOData } from '../models/VBOData'
import { LapData, getLapColor } from '../models/LapData'
import {
  gpsToMeters,
  metersToGps,
  haversineDistance,
  vboToDecimal,
  parseFormattedTimeToMs,
  formatVBOTime
} from './coordinateUtils'
import {
  normalizeVector,
  perpendicular,
  segmentIntersection
} from './geometryUtils'

/**
 * Основной класс парсера VBO файлов
 */
export class VBOParser {
  /**
   * Парсит содержимое VBO файла и возвращает структурированные данные
   * 
   * @param content Текстовое содержимое VBO файла
   * @returns Объект VBOData с треком и кругами
   */
  static parse(content: string): VBOData {
    console.log('=== VBO Parser Start ===')
    
    // 1. Парсинг текста файла
    const { header, rows } = this.parseFileContent(content)
    console.log(`Parsed ${rows.length} data rows`)
    
    // 2. Вычисление границ трека
    const boundingBox = this.calculateBoundingBox(rows)
    console.log(`Bounding box: [${boundingBox.minLat.toFixed(6)}, ${boundingBox.minLong.toFixed(6)}] - [${boundingBox.maxLat.toFixed(6)}, ${boundingBox.maxLong.toFixed(6)}]`)
    
    // 3. Добавление метрических координат
    this.addMetricCoordinates(rows, boundingBox)
    
    // 4. Вычисление производных параметров (расстояние, направление)
    this.calculateDerivedData(rows)
    
    // 5. Определение линии старт/финиш
    const startFinish = this.detectStartFinish(rows, boundingBox)
    if (startFinish) {
      console.log(`Start/Finish detected at (${startFinish.pointMeters.x.toFixed(2)}, ${startFinish.pointMeters.y.toFixed(2)})m`)
    }
    
    // 6. Разделение на круги
    const laps = this.splitIntoLaps(rows, boundingBox, startFinish)
    console.log(`Detected ${laps.length} laps`)
    
    // 7. Создание модели данных
    const vboData = new VBOData(header, rows, boundingBox, startFinish, laps)
    
    // 8. Применяем эвристику фильтрации (скрываем круги отличающиеся от медианы > 15%)
    vboData.applyTimeHeuristics(15)
    
    console.log('=== VBO Parser Complete ===')
    return vboData
  }

  /**
   * Парсит текстовое содержимое файла
   */
  private static parseFileContent(content: string): {
    header: VBOHeader
    rows: VBODataRow[]
  } {
    const lines = content.split('\n').map(line => line.trim())
    
    const header: VBOHeader = {
      columnNames: [],
      comments: []
    }
    const rows: VBODataRow[] = []
    
    let currentSection = ''
    
    for (const line of lines) {
      if (!line) continue
      
      // Определение секции
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).toLowerCase()
        continue
      }
      
      // Обработка секций
      switch (currentSection) {
        case 'comments':
          header.comments.push(line)
          break
          
        case 'column names':
          header.columnNames = line.split(/\s+/)
          break
          
        case 'data':
          const row = this.parseDataRow(line)
          if (row) rows.push(row)
          break
          
        default:
          if (line.startsWith('File created on')) {
            header.fileCreated = line
          }
      }
    }
    
    return { header, rows }
  }

  /**
   * Парсит одну строку данных
   */
  private static parseDataRow(line: string): VBODataRow | null {
    const parts = line.split(/\s+/)
    
    if (parts.length < 7) return null
    
    try {
      const vboLat = parseFloat(parts[2])
      const vboLong = parseFloat(parts[3])
      
      // Конвертация VBO координат в GPS (десятичные градусы)
      const lat = vboToDecimal(vboLat, true)
      const long = vboToDecimal(vboLong, false)
      
      return {
        sats: parseInt(parts[0], 10),
        time: formatVBOTime(parts[1]),
        lat,
        long,
        velocity: parseFloat(parts[4]),
        heading: parseFloat(parts[5]),
        height: parseFloat(parts[6]),
        x: 0, // будет установлено в addMetricCoordinates
        y: 0  // будет установлено в addMetricCoordinates
      }
    } catch (error) {
      console.error('Error parsing row:', line, error)
      return null
    }
  }

  /**
   * Вычисляет границы трека (bounding box)
   */
  private static calculateBoundingBox(rows: VBODataRow[]): BoundingBox {
    const bbox: BoundingBox = {
      minLat: Infinity,
      maxLat: -Infinity,
      minLong: Infinity,
      maxLong: -Infinity,
      centerLat: 0,
      centerLong: 0,
      width: 0,
      height: 0
    }
    
    // Находим минимумы и максимумы
    for (const row of rows) {
      if (row.lat < bbox.minLat) bbox.minLat = row.lat
      if (row.lat > bbox.maxLat) bbox.maxLat = row.lat
      if (row.long < bbox.minLong) bbox.minLong = row.long
      if (row.long > bbox.maxLong) bbox.maxLong = row.long
    }
    
    // Вычисляем центр и размеры
    bbox.centerLat = (bbox.minLat + bbox.maxLat) / 2
    bbox.centerLong = (bbox.minLong + bbox.maxLong) / 2
    bbox.width = bbox.maxLong - bbox.minLong
    bbox.height = bbox.maxLat - bbox.minLat
    
    return bbox
  }

  /**
   * Добавляет метрические координаты (x, y в метрах)
   */
  private static addMetricCoordinates(rows: VBODataRow[], bbox: BoundingBox): void {
    // Используем левый нижний угол как точку отсчета (0, 0)
    const originLat = bbox.minLat
    const originLong = bbox.minLong
    
    for (const row of rows) {
      const meters = gpsToMeters(row.lat, row.long, originLat, originLong)
      row.x = meters.x
      row.y = meters.y
    }
  }

  /**
   * Вычисляет производные параметры (расстояние, направление, deltaTime)
   */
  private static calculateDerivedData(rows: VBODataRow[]): void {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      
      // Время относительно предыдущей точки (time уже в формате HH:MM:SS.mmm)
      const prevTime = parseFormattedTimeToMs(prev.time)
      const currTime = parseFormattedTimeToMs(curr.time)
      curr.deltaTime = currTime - prevTime
      
      // Расстояние по Haversine
      curr.distance = haversineDistance(prev.lat, prev.long, curr.lat, curr.long)
      
      // Направление движения (нормализованный вектор)
      const dx = curr.long - prev.long
      const dy = curr.lat - prev.lat
      curr.direction = normalizeVector({ x: dx, y: dy })
      
      // Перпендикуляр к направлению
      curr.perpendicular = perpendicular(curr.direction)
    }
    
    // Первая точка берет данные от второй
    if (rows.length > 1) {
      rows[0].deltaTime = 0
      rows[0].distance = 0
      rows[0].direction = rows[1].direction
      rows[0].perpendicular = rows[1].perpendicular
    }
  }

  /**
   * Определяет линию старт/финиш по точке с максимальной скоростью
   */
  private static detectStartFinish(
    rows: VBODataRow[],
    _bbox: BoundingBox // _ prefix to indicate intentionally unused
  ): StartFinishLine | undefined {
    if (rows.length < 50) return undefined
    
    // Находим точку с максимальной скоростью (не на краях)
    let maxVelIdx = 0
    let maxVel = 0
    for (let i = 20; i < rows.length - 20; i++) {
      if (rows[i].velocity > maxVel) {
        maxVel = rows[i].velocity
        maxVelIdx = i
      }
    }
    
    // Собираем точки за 20 метров до точки с макс скоростью
    let cumulativeDistance = 0
    let startIdx = maxVelIdx
    const targetDistance = 20 // метров
    
    for (let i = maxVelIdx - 1; i >= 0 && cumulativeDistance < targetDistance; i--) {
      const distance = rows[i]?.distance
      if (distance) {
        cumulativeDistance += distance
      }
      startIdx = i
    }
    
    // Вычисляем среднее направление в метрических координатах
    let avgDirX = 0
    let avgDirY = 0
    let count = 0
    
    for (let i = startIdx + 1; i <= maxVelIdx; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      if (prev && curr) {
        avgDirX += curr.x - prev.x
        avgDirY += curr.y - prev.y
        count++
      }
    }
    
    if (count === 0) return undefined
    
    const direction = normalizeVector({ x: avgDirX / count, y: avgDirY / count })
    const perp = perpendicular(direction)
    
    const sfRow = rows[maxVelIdx]
    
    return {
      point: { lat: sfRow.lat, long: sfRow.long },
      pointMeters: { x: sfRow.x, y: sfRow.y },
      direction,
      perpendicular: perp,
      width: 40 // метров
    }
  }

  /**
   * Разделяет трек на круги по пересечениям с линией старт/финиш
   */
  private static splitIntoLaps(
    rows: VBODataRow[],
    bbox: BoundingBox,
    startFinish?: StartFinishLine
  ): LapData[] {
    // Если нет линии старт/финиш - весь трек один круг
    if (!startFinish || rows.length < 10) {
      return [new LapData(0, rows, getLapColor(0), 0, rows.length - 1, rows)]
    }
    
    const sf = startFinish
    const laps: LapData[] = []
    
    // Вычисляем две точки отрезка детекции (перпендикуляр к направлению движения)
    const halfWidth = sf.width / 2
    const detectionX1 = sf.pointMeters.x - sf.perpendicular.x * halfWidth
    const detectionY1 = sf.pointMeters.y - sf.perpendicular.y * halfWidth
    const detectionX2 = sf.pointMeters.x + sf.perpendicular.x * halfWidth
    const detectionY2 = sf.pointMeters.y + sf.perpendicular.y * halfWidth
    
    let currentLapRows: VBODataRow[] = [rows[0]]
    let lapStartIdx = 0 // Индекс начала текущего круга в исходном массиве
    const minLapSize = 50 // минимум точек в круге
    
    // Обрабатываем точки по порядку
    for (let i = 1; i < rows.length; i++) {
      const p1 = rows[i - 1]
      const p2 = rows[i]
      
      // Проверяем пересечение отрезка траектории с отрезком детекции
      const t = segmentIntersection(
        p1.x, p1.y, p2.x, p2.y,
        detectionX1, detectionY1, detectionX2, detectionY2
      )
      
      // Если нашли пересечение и набрали минимум точек
      if (t !== null && currentLapRows.length >= minLapSize) {
        // Создаем интерполированную точку на пересечении
        const intersectionPoint = this.interpolatePoint(p1, p2, t, bbox)
        
        // Завершаем текущий круг
        currentLapRows.push(intersectionPoint)
        const lapEndIdx = i - 1 // Конец круга - последняя полная точка
        
        laps.push(
          new LapData(
            laps.length,
            currentLapRows,
            getLapColor(laps.length),
            lapStartIdx,
            lapEndIdx,
            rows // Передаем исходный массив для расчета времени
          )
        )
        
        // Начинаем новый круг с копии интерполированной точки
        currentLapRows = [{ ...intersectionPoint }]
        lapStartIdx = i // Следующий круг начинается с текущей точки
      } else {
        // Добавляем точку в текущий круг
        currentLapRows.push(p2)
      }
    }
    
    // Добавляем последний круг
    if (currentLapRows.length > 1) {
      const lapEndIdx = rows.length - 1
      laps.push(
        new LapData(
          laps.length,
          currentLapRows,
          getLapColor(laps.length),
          lapStartIdx,
          lapEndIdx,
          rows
        )
      )
    }
    
    // Если не нашли пересечений - весь трек один круг
    if (laps.length === 0) {
      laps.push(new LapData(0, rows, getLapColor(0), 0, rows.length - 1, rows))
    }
    
    
    return laps
  }

  /**
   * Интерполирует точку между двумя точками
   */
  private static interpolatePoint(
    p1: VBODataRow,
    p2: VBODataRow,
    t: number,
    bbox: BoundingBox
  ): VBODataRow {
    // Интерполяция в метрах
    const x = p1.x + t * (p2.x - p1.x)
    const y = p1.y + t * (p2.y - p1.y)
    
    // Конвертируем обратно в GPS
    const gps = metersToGps(x, y, bbox.minLat, bbox.minLong)
    
    // Интерполяция времени (используем parseFormattedTimeToMs для формата HH:MM:SS.mmm)
    const time1 = parseFormattedTimeToMs(p1.time)
    const time2 = parseFormattedTimeToMs(p2.time)
    const timeMs = time1 + t * (time2 - time1)
    
    
    // Форматирование времени в формат HH:MM:SS.mmm
    const totalSeconds = timeMs / 1000
    const hh = Math.floor(totalSeconds / 3600)
    const mm = Math.floor((totalSeconds % 3600) / 60)
    const ssRemainder = totalSeconds % 60
    const ssWhole = Math.floor(ssRemainder)
    const ssFrac = Math.floor((ssRemainder - ssWhole) * 1000)
    
    const timeFormatted = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ssWhole.toString().padStart(2, '0')}.${ssFrac.toString().padStart(3, '0')}`
    
    return {
      sats: p1.sats,
      time: timeFormatted,
      lat: gps.lat,
      long: gps.long,
      velocity: p1.velocity + t * (p2.velocity - p1.velocity),
      heading: p1.heading + t * (p2.heading - p1.heading),
      height: p1.height + t * (p2.height - p1.height),
      x,
      y,
      distance: t * (p2.distance || 0),
      deltaTime: t * (p2.deltaTime || 0),
      direction: p1.direction,
      perpendicular: p1.perpendicular,
      isInterpolated: true
    }
  }
}

// Экспортируем старые типы для обратной совместимости
export type {
  VBOHeader,
  VBODataRow,
  BoundingBox,
  StartFinishLine,
  Vector2D
} from '../models/types'

// Экспортируем VBOData
export { VBOData } from '../models/VBOData'

// Экспортируем функции конвертации для использования в TrackVisualizer
export { gpsToMeters, metersToGps, parseFormattedTimeToMs } from './coordinateUtils'

// Интерфейс Lap для обратной совместимости
export interface Lap {
  index: number
  startIdx: number
  endIdx: number
  rows: VBODataRow[]
}

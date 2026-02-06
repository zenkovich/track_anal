export interface VBOHeader {
  fileCreated?: string;
  columnNames: string[];
  comments: string[];
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface VBODataRow {
  sats: number;
  time: string;
  lat: number;
  long: number;
  velocity: number;
  heading: number;
  height: number;
  deltaTime?: number;
  direction?: Vector2D;
  perpendicular?: Vector2D;
  distance?: number;
  // Координаты в метрах относительно minLat, minLong
  x: number;
  y: number;
  isInterpolated?: boolean; // Флаг интерполированной точки
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLong: number;
  maxLong: number;
  centerLat: number;
  centerLong: number;
  width: number;
  height: number;
}

export interface StartFinishLine {
  point: { lat: number; long: number };
  pointMeters: { x: number; y: number };
  direction: Vector2D;
  perpendicular: Vector2D;
  width: number;
}

export interface Lap {
  index: number;
  startIdx: number;
  endIdx: number;
  rows: VBODataRow[];
}

export interface VBOData {
  header: VBOHeader;
  rows: VBODataRow[];
  boundingBox: BoundingBox;
  startFinish?: StartFinishLine;
  laps: Lap[];
}

/**
 * Вспомогательные функции для работы с геоданными
 */

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // радиус Земли в метрах
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function normalizeVector(v: Vector2D): Vector2D {
  const len = Math.sqrt(v.x * v.x + v.y * v.y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

function perpendicular(v: Vector2D): Vector2D {
  return { x: -v.y, y: v.x }
}

function parseTime(timeStr: string): number {
  const hh = parseInt(timeStr.substring(0, 2))
  const mm = parseInt(timeStr.substring(2, 4))
  const ss = parseFloat(timeStr.substring(4))
  return (hh * 3600 + mm * 60 + ss) * 1000
}

/**
 * Конвертирует GPS координаты в метры относительно опорной точки (originLat, originLong)
 * Использует локальную приближенную проекцию
 */
export function gpsToMeters(lat: number, long: number, originLat: number, originLong: number): { x: number; y: number } {
  // Радиус Земли в метрах
  const R = 6371000
  
  // Конвертация в радианы
  const latRad = lat * Math.PI / 180
  const longRad = long * Math.PI / 180
  const originLatRad = originLat * Math.PI / 180
  const originLongRad = originLong * Math.PI / 180
  
  // Разница в координатах
  const dLat = latRad - originLatRad
  const dLong = longRad - originLongRad
  
  // Приближенная проекция (работает хорошо для небольших расстояний)
  // x - восток-запад (долгота)
  // y - север-юг (широта)
  const x = dLong * R * Math.cos(originLatRad)
  const y = dLat * R
  
  return { x, y }
}

/**
 * Конвертирует метрические координаты обратно в GPS
 */
export function metersToGps(x: number, y: number, originLat: number, originLong: number): { lat: number; long: number } {
  const R = 6371000
  const originLatRad = originLat * Math.PI / 180
  
  // Обратная конвертация
  const dLat = y / R
  const dLong = x / (R * Math.cos(originLatRad))
  
  const lat = originLat + dLat * 180 / Math.PI
  const long = originLong + dLong * 180 / Math.PI
  
  return { lat, long }
}

/**
 * Конвертирует координаты из формата VBO в десятичные градусы.
 * VBO хранит координаты в угловых минутах.
 * Долгота инвертирована по знаку.
 */
let debugCount = 0
function vboToDecimal(vboCoord: number, isLatitude: boolean): number {
  let degrees = vboCoord / 60
  
  if (!isLatitude) {
    degrees = -degrees
  }
  
  if (debugCount < 2) {
    const coordType = isLatitude ? 'LAT' : 'LNG'
    console.log(`[${coordType}] ${vboCoord} min -> ${degrees.toFixed(6)}°`)
    debugCount++
  }
  
  return degrees
}

/**
 * Парсер VBO файлов (формат dragy)
 */
export class VBOParser {
  static parse(content: string): VBOData {
    // Сбрасываем счетчик debug для нового файла
    debugCount = 0
    
    const lines = content.split('\n').map(line => line.trim());
    
    const result: VBOData = {
      header: {
        columnNames: [],
        comments: []
      },
      rows: [],
      boundingBox: {
        minLat: Infinity,
        maxLat: -Infinity,
        minLong: Infinity,
        maxLong: -Infinity,
        centerLat: 0,
        centerLong: 0,
        width: 0,
        height: 0
      },
      laps: []
    };

    let currentSection = '';
    
    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).toLowerCase();
        continue;
      }

      switch (currentSection) {
        case 'comments':
          result.header.comments.push(line);
          break;

        case 'column names':
          result.header.columnNames = line.split(/\s+/);
          break;

        case 'data':
          const row = this.parseDataRow(line);
          if (row) {
            result.rows.push(row);
            this.updateBoundingBox(result.boundingBox, row.lat, row.long);
          }
          break;

        default:
          if (line.startsWith('File created on')) {
            result.header.fileCreated = line;
          }
      }
    }

    this.finalizeBoundingBox(result.boundingBox);
    this.addMetricCoordinates(result.rows, result.boundingBox);
    this.calculateDerivedData(result.rows);
    this.detectStartFinish(result);
    this.splitIntoLaps(result);

    console.log('VBO Parser Result:')
    console.log(`  Rows: ${result.rows.length}`)
    console.log(`  Laps: ${result.laps.length}`)
    if (result.rows.length > 0) {
      const first = result.rows[0]
      console.log(`  First: ${first.lat.toFixed(6)}, ${first.long.toFixed(6)}`)
      console.log(`  Center: ${result.boundingBox.centerLat.toFixed(6)}, ${result.boundingBox.centerLong.toFixed(6)}`)
    }
    if (result.startFinish) {
      console.log(`  Start/Finish: ${result.startFinish.point.lat.toFixed(6)}, ${result.startFinish.point.long.toFixed(6)}`)
    }

    return result;
  }

  private static updateBoundingBox(bbox: BoundingBox, lat: number, long: number): void {
    if (lat < bbox.minLat) bbox.minLat = lat;
    if (lat > bbox.maxLat) bbox.maxLat = lat;
    if (long < bbox.minLong) bbox.minLong = long;
    if (long > bbox.maxLong) bbox.maxLong = long;
  }

  private static finalizeBoundingBox(bbox: BoundingBox): void {
    bbox.centerLat = (bbox.minLat + bbox.maxLat) / 2;
    bbox.centerLong = (bbox.minLong + bbox.maxLong) / 2;
    bbox.width = bbox.maxLong - bbox.minLong;
    bbox.height = bbox.maxLat - bbox.minLat;
  }

  private static addMetricCoordinates(rows: VBODataRow[], bbox: BoundingBox): void {
    // Используем левый нижний угол как точку отсчета (0, 0)
    const originLat = bbox.minLat
    const originLong = bbox.minLong
    
    for (const row of rows) {
      const meters = gpsToMeters(row.lat, row.long, originLat, originLong)
      row.x = meters.x
      row.y = meters.y
    }
    
    console.log(`[Metric Coords] Added metric coordinates for ${rows.length} points`)
    if (rows.length > 0) {
      console.log(`[Metric Coords] First point: (${rows[0].x.toFixed(2)}, ${rows[0].y.toFixed(2)}) meters`)
      console.log(`[Metric Coords] Last point: (${rows[rows.length-1].x.toFixed(2)}, ${rows[rows.length-1].y.toFixed(2)}) meters`)
    }
  }

  private static calculateDerivedData(rows: VBODataRow[]): void {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      
      // Время относительно предыдущей точки
      const prevTime = parseTime(prev.time)
      const currTime = parseTime(curr.time)
      curr.deltaTime = currTime - prevTime
      
      // Расстояние
      curr.distance = haversineDistance(prev.lat, prev.long, curr.lat, curr.long)
      
      // Направление (нормализованный вектор)
      const dx = curr.long - prev.long
      const dy = curr.lat - prev.lat
      const direction = normalizeVector({ x: dx, y: dy })
      curr.direction = direction
      
      // Перпендикуляр
      curr.perpendicular = perpendicular(direction)
    }
    
    // Первая точка
    if (rows.length > 1) {
      rows[0].deltaTime = 0
      rows[0].distance = 0
      rows[0].direction = rows[1].direction
      rows[0].perpendicular = rows[1].perpendicular
    }
  }

  private static detectStartFinish(data: VBOData): void {
    const rows = data.rows
    if (rows.length < 50) return
    
    // Находим точку с максимальной скоростью
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
      const dist = rows[i].distance
      if (dist !== undefined) {
        cumulativeDistance += dist
      }
      startIdx = i
    }
    
    // Вычисляем среднее направление В МЕТРИЧЕСКИХ КООРДИНАТАХ
    let avgDirX = 0
    let avgDirY = 0
    let count = 0
    for (let i = startIdx + 1; i <= maxVelIdx; i++) {
      const prev = rows[i - 1]
      const curr = rows[i]
      
      // Направление в метрах
      const dx = curr.x - prev.x
      const dy = curr.y - prev.y
      avgDirX += dx
      avgDirY += dy
      count++
    }
    
    if (count === 0) return
    
    const direction = normalizeVector({ x: avgDirX / count, y: avgDirY / count })
    const perp = perpendicular(direction)
    
    const sfRow = rows[maxVelIdx]
    data.startFinish = {
      point: { lat: sfRow.lat, long: sfRow.long },
      pointMeters: { x: sfRow.x, y: sfRow.y },
      direction,
      perpendicular: perp,
      width: 40 // метров
    }
    
    console.log(`[Start/Finish] Position: (${sfRow.x.toFixed(2)}, ${sfRow.y.toFixed(2)}) meters`)
    console.log(`[Start/Finish] Direction: (${direction.x.toFixed(4)}, ${direction.y.toFixed(4)})`)
    console.log(`[Start/Finish] Perpendicular: (${perp.x.toFixed(4)}, ${perp.y.toFixed(4)})`)
  }

  /**
   * Проверка пересечения двух конечных отрезков
   * Segment 1: (x1, y1) -> (x2, y2)
   * Segment 2: (x3, y3) -> (x4, y4)
   * Возвращает параметр t [0,1] для первого отрезка, если есть пересечение
   */
  private static segmentIntersection(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
  ): number | null {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    
    // Отрезки параллельны или совпадают
    if (Math.abs(denom) < 1e-10) return null
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
    
    // Проверяем что пересечение внутри обоих отрезков
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return t
    }
    
    return null
  }

  /**
   * Интерполирует данные точки между двумя точками
   */
  private static interpolatePoint(p1: VBODataRow, p2: VBODataRow, t: number, bbox: BoundingBox): VBODataRow {
    const x = p1.x + t * (p2.x - p1.x)
    const y = p1.y + t * (p2.y - p1.y)
    
    // Конвертируем обратно в GPS
    const gps = metersToGps(x, y, bbox.minLat, bbox.minLong)
    
    // Интерполяция времени
    const parseTime = (timeStr: string): number => {
      const parts = timeStr.split(':')
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
    }
    
    const formatTime = (totalSeconds: number): string => {
      const hh = Math.floor(totalSeconds / 3600)
      const mm = Math.floor((totalSeconds % 3600) / 60)
      const ss = totalSeconds % 60
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toFixed(3).padStart(6, '0')}`
    }
    
    const time1 = parseTime(p1.time)
    const time2 = parseTime(p2.time)
    const timeInterpolated = time1 + t * (time2 - time1)
    
    return {
      sats: p1.sats,
      time: formatTime(timeInterpolated),
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

  private static splitIntoLaps(data: VBOData): void {
    if (!data.startFinish || data.rows.length < 10) {
      data.laps = [{
        index: 0,
        startIdx: 0,
        endIdx: data.rows.length - 1,
        rows: data.rows
      }]
      return
    }
    
    const sf = data.startFinish
    const rows = data.rows
    const bbox = data.boundingBox
    
    // Вычисляем две точки отрезка детекции (перпендикуляр к направлению движения)
    const halfWidth = sf.width / 2 // в метрах
    const detectionX1 = sf.pointMeters.x - sf.perpendicular.x * halfWidth
    const detectionY1 = sf.pointMeters.y - sf.perpendicular.y * halfWidth
    const detectionX2 = sf.pointMeters.x + sf.perpendicular.x * halfWidth
    const detectionY2 = sf.pointMeters.y + sf.perpendicular.y * halfWidth
    
    console.log(`[Lap Detection] Starting with ${rows.length} points`)
    console.log(`[Lap Detection] Start/Finish at (${sf.pointMeters.x.toFixed(2)}, ${sf.pointMeters.y.toFixed(2)}) meters`)
    console.log(`[Lap Detection] Detection segment: (${detectionX1.toFixed(2)}, ${detectionY1.toFixed(2)}) -> (${detectionX2.toFixed(2)}, ${detectionY2.toFixed(2)})`)
    console.log(`[Lap Detection] Width: ${sf.width}m`)
    
    const laps: Lap[] = []
    let currentLapRows: VBODataRow[] = [rows[0]]
    const minLapSize = 50
    
    // Обрабатываем точки по порядку
    for (let i = 1; i < rows.length; i++) {
      const p1 = rows[i - 1]
      const p2 = rows[i]
      
      // Проверяем пересечение отрезка траектории с отрезком детекции
      const t = this.segmentIntersection(
        p1.x, p1.y, p2.x, p2.y,
        detectionX1, detectionY1, detectionX2, detectionY2
      )
      
      if (t !== null && currentLapRows.length >= minLapSize) {
        // Пересечение найдено! Создаем интерполированную точку
        const intersectionPoint = this.interpolatePoint(p1, p2, t, bbox)
        
        // Завершаем текущий круг интерполированной точкой
        currentLapRows.push(intersectionPoint)
        
        laps.push({
          index: laps.length,
          startIdx: 0, // будет переназначен позже
          endIdx: 0,   // будет переназначен позже
          rows: currentLapRows
        })
        
        console.log(`[Lap Detection] Lap ${laps.length} finished with ${currentLapRows.length} points`)
        console.log(`  Intersection at: (${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}) meters, t=${t.toFixed(3)}`)
        
        // Начинаем новый круг с копии интерполированной точки
        currentLapRows = [{ ...intersectionPoint }]
      } else {
        // Пересечения нет, добавляем точку в текущий круг
        currentLapRows.push(p2)
      }
    }
    
    // Добавляем последний круг (если есть точки)
    if (currentLapRows.length > 1) {
      laps.push({
        index: laps.length,
        startIdx: 0,
        endIdx: 0,
        rows: currentLapRows
      })
      console.log(`[Lap Detection] Final lap: ${currentLapRows.length} points`)
    }
    
    console.log(`[Lap Detection] Total laps detected: ${laps.length}`)
    
    // Если не нашли пересечений, весь трек - один круг
    if (laps.length === 0) {
      laps.push({
        index: 0,
        startIdx: 0,
        endIdx: rows.length - 1,
        rows: rows
      })
    }
    
    data.laps = laps
  }

  private static parseDataRow(line: string): VBODataRow | null {
    const parts = line.split(/\s+/);
    
    if (parts.length < 7) {
      return null;
    }

    try {
      const vboLat = parseFloat(parts[2]);
      const vboLong = parseFloat(parts[3]);
      
      if (debugCount === 0) {
        console.log('First data row:', parts.slice(0, 7))
      }
      
      // Конвертируем координаты
      const lat = vboToDecimal(vboLat, true);   // true = latitude
      const long = vboToDecimal(vboLong, false); // false = longitude
      
      return {
        sats: parseInt(parts[0], 10),
        time: this.formatTime(parts[1]),
        lat,
        long,
        velocity: parseFloat(parts[4]),
        heading: parseFloat(parts[5]),
        height: parseFloat(parts[6]),
        x: 0, // будет установлено в addMetricCoordinates
        y: 0  // будет установлено в addMetricCoordinates
      };
    } catch (error) {
      console.error('Error parsing row:', line, error);
      return null;
    }
  }

  private static formatTime(timeStr: string): string {
    if (timeStr.length < 6) return timeStr;
    
    const hh = timeStr.substring(0, 2);
    const mm = timeStr.substring(2, 4);
    const ss = timeStr.substring(4);
    
    return `${hh}:${mm}:${ss}`;
  }

  static getMetadata(data: VBOData): { [key: string]: string } {
    const metadata: { [key: string]: string } = {};

    data.header.comments.forEach(comment => {
      const colonIndex = comment.indexOf(':');
      if (colonIndex > 0) {
        const key = comment.substring(0, colonIndex).trim();
        const value = comment.substring(colonIndex + 1).trim();
        metadata[key] = value;
      }
    });

    if (data.header.fileCreated) {
      metadata['File Created'] = data.header.fileCreated.replace('File created on ', '');
    }

    metadata['Total Points'] = data.rows.length.toString();

    return metadata;
  }
}

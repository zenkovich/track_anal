/**
 * Утилиты для работы с GPS координатами и их конвертации
 */

/**
 * Конвертирует GPS координаты в метры относительно опорной точки
 * 
 * Использует локальную приближенную проекцию (Equirectangular projection)
 * Работает хорошо для небольших расстояний (до нескольких километров)
 * 
 * @param lat Широта точки (градусы)
 * @param long Долгота точки (градусы)
 * @param originLat Широта опорной точки (градусы)
 * @param originLong Долгота опорной точки (градусы)
 * @returns Координаты в метрах { x: восток-запад, y: север-юг }
 */
export function gpsToMeters(
  lat: number,
  long: number,
  originLat: number,
  originLong: number
): { x: number; y: number } {
  // Радиус Земли в метрах
  const R = 6371000
  
  // Конвертация в радианы
  const latRad = (lat * Math.PI) / 180
  const longRad = (long * Math.PI) / 180
  const originLatRad = (originLat * Math.PI) / 180
  const originLongRad = (originLong * Math.PI) / 180
  
  // Разница в координатах
  const dLat = latRad - originLatRad
  const dLong = longRad - originLongRad
  
  // Приближенная проекция
  // x - восток-запад (долгота)
  // y - север-юг (широта)
  const x = dLong * R * Math.cos(originLatRad)
  const y = dLat * R
  
  return { x, y }
}

/**
 * Конвертирует метрические координаты обратно в GPS
 * 
 * @param x Координата X в метрах (восток-запад)
 * @param y Координата Y в метрах (север-юг)
 * @param originLat Широта опорной точки (градусы)
 * @param originLong Долгота опорной точки (градусы)
 * @returns GPS координаты { lat, long } в градусах
 */
export function metersToGps(
  x: number,
  y: number,
  originLat: number,
  originLong: number
): { lat: number; long: number } {
  const R = 6371000
  const originLatRad = (originLat * Math.PI) / 180
  
  // Обратная конвертация
  const dLat = y / R
  const dLong = x / (R * Math.cos(originLatRad))
  
  const lat = originLat + (dLat * 180) / Math.PI
  const long = originLong + (dLong * 180) / Math.PI
  
  return { lat, long }
}

/**
 * Вычисляет расстояние между двумя GPS точками по формуле Haversine
 * 
 * @param lat1 Широта первой точки (градусы)
 * @param lon1 Долгота первой точки (градусы)
 * @param lat2 Широта второй точки (градусы)
 * @param lon2 Долгота второй точки (градусы)
 * @returns Расстояние в метрах
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // радиус Земли в метрах
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Конвертирует координаты из формата VBO в десятичные градусы
 * 
 * VBO хранит координаты в угловых минутах
 * Долгота инвертирована по знаку
 * 
 * @param vboCoord Координата в формате VBO (угловые минуты)
 * @param isLatitude true для широты, false для долготы
 * @returns Координата в десятичных градусах
 */
export function vboToDecimal(vboCoord: number, isLatitude: boolean): number {
  // Конвертация из угловых минут в градусы
  let degrees = vboCoord / 60
  
  // Долгота инвертирована
  if (!isLatitude) {
    degrees = -degrees
  }
  
  return degrees
}

/**
 * Парсит время из строки формата HHMMSS.mmm в миллисекунды
 * 
 * @param timeStr Время в формате HHMMSS.mmm
 * @returns Время в миллисекундах
 */
export function parseTimeToMs(timeStr: string): number {
  const hh = parseInt(timeStr.substring(0, 2), 10)
  const mm = parseInt(timeStr.substring(2, 4), 10)
  const ss = parseFloat(timeStr.substring(4))
  return (hh * 3600 + mm * 60 + ss) * 1000
}

/**
 * Парсит время из форматированной строки HH:MM:SS.mmm в миллисекунды
 * 
 * @param timeStr Время в формате HH:MM:SS.mmm
 * @returns Время в миллисекундах
 */
export function parseFormattedTimeToMs(timeStr: string): number {
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
 * Форматирует время из строки HHMMSS.mmm в HH:MM:SS.mmm
 * 
 * @param timeStr Время в формате HHMMSS.mmm
 * @returns Время в формате HH:MM:SS.mmm
 */
export function formatVBOTime(timeStr: string): string {
  if (timeStr.length < 6) return timeStr
  
  const hh = timeStr.substring(0, 2)
  const mm = timeStr.substring(2, 4)
  const ss = timeStr.substring(4)
  
  return `${hh}:${mm}:${ss}`
}

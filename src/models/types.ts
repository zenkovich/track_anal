/**
 * Базовые типы данных для VBO Track Viewer
 */

/**
 * 2D вектор для направлений и перпендикуляров
 */
export interface Vector2D {
  x: number
  y: number
}

/**
 * Заголовок VBO файла с метаданными
 */
export interface VBOHeader {
  fileCreated?: string
  columnNames: string[]
  comments: string[]
}

/**
 * Одна точка GPS трека из VBO файла
 */
export interface VBODataRow {
  // GPS данные
  sats: number          // Количество спутников
  time: string          // Время в формате HH:MM:SS.mmm
  lat: number           // Широта (десятичные градусы)
  long: number          // Долгота (десятичные градусы)
  velocity: number      // Скорость (км/ч)
  heading: number       // Направление (градусы)
  height: number        // Высота над уровнем моря (м)
  
  // Метрические координаты (в метрах от origin)
  x: number             // Координата X (восток-запад)
  y: number             // Координата Y (север-юг)
  
  // Вычисленные параметры
  deltaTime?: number    // Время с предыдущей точки (мс)
  distance?: number     // Расстояние до предыдущей точки (м)
  direction?: Vector2D  // Направление движения (нормализованный вектор)
  perpendicular?: Vector2D // Перпендикуляр к направлению
  
  // Параметры в контексте круга
  lapTimeFromStart?: number    // Время от начала круга (мс)
  lapDistanceFromStart?: number // Дистанция от начала круга (м)
  
  // Флаги
  isInterpolated?: boolean // Точка создана интерполяцией (на пересечении)
}

/**
 * Границы трека (bounding box)
 */
export interface BoundingBox {
  minLat: number
  maxLat: number
  minLong: number
  maxLong: number
  centerLat: number
  centerLong: number
  width: number   // В градусах
  height: number  // В градусах
}

/**
 * Линия старт/финиш для определения кругов
 */
export interface StartFinishLine {
  point: { lat: number; long: number }     // Позиция в GPS координатах
  pointMeters: { x: number; y: number }    // Позиция в метрах
  direction: Vector2D                      // Направление движения через линию
  perpendicular: Vector2D                  // Перпендикуляр (направление самой линии)
  width: number                            // Ширина линии детекции (м)
}

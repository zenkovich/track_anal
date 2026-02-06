/**
 * Утилиты для геометрических вычислений
 */

import { Vector2D } from '../models/types'

/**
 * Нормализует вектор (приводит его длину к 1)
 * 
 * @param v Вектор для нормализации
 * @returns Нормализованный вектор
 */
export function normalizeVector(v: Vector2D): Vector2D {
  const len = Math.sqrt(v.x * v.x + v.y * v.y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

/**
 * Вычисляет перпендикуляр к вектору (поворот на 90° против часовой стрелки)
 * 
 * @param v Исходный вектор
 * @returns Перпендикулярный вектор
 */
export function perpendicular(v: Vector2D): Vector2D {
  return { x: -v.y, y: v.x }
}

/**
 * Проверяет пересечение двух конечных отрезков
 * 
 * Segment 1: (x1, y1) -> (x2, y2)
 * Segment 2: (x3, y3) -> (x4, y4)
 * 
 * @returns Параметр t [0,1] для первого отрезка, если есть пересечение, иначе null
 */
export function segmentIntersection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
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

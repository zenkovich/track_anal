/**
 * Geometry utilities
 */

import { Vector2D } from "../models/types";

/**
 * Normalize vector (length 1)
 * @param v Vector to normalize
 * @returns Normalized vector
 */
export function normalizeVector(v: Vector2D): Vector2D 
{
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Perpendicular to vector (90° counter-clockwise)
 * @param v Input vector
 * @returns Perpendicular vector
 */
export function perpendicular(v: Vector2D): Vector2D 
{
  return { x: -v.y, y: v.x };
}

/**
 * Intersection of two line segments.
 * Segment 1: (x1, y1) -> (x2, y2), Segment 2: (x3, y3) -> (x4, y4)
 * @returns Parameter t [0,1] on first segment if intersection exists, else null
 */
export function segmentIntersection(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): number | null 
{
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Segments parallel or coincident
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Intersection must lie within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) 
  {
    return t;
  }

  return null;
}

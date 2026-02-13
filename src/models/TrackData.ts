/**
 * Track data model - name, length, start-finish, sectors
 * Created after VBO parsing for caching and sector-based analysis
 */

import { StartFinishLine, Vector2D } from "./types";

/**
 * Sector boundary - similar to start/finish line
 * Position, orientation (direction + perpendicular), width
 */
export interface SectorBoundary {
  /** Distance from lap start where this boundary is (m) */
  startDistance: number;
  /** Sector length (m) - distance to next boundary */
  length: number;
  /** Position in GPS */
  point: { lat: number; long: number };
  /** Position in meters */
  pointMeters: { x: number; y: number };
  /** Movement direction across line */
  direction: Vector2D;
  /** Perpendicular (line direction) */
  perpendicular: Vector2D;
  /** Detection line width (m) - half of start-finish width */
  width: number;
}

/**
 * Track data - created after parsing, used for sector analysis
 */
export interface TrackData {
  /** Track name from metadata */
  name: string;
  /** Track length (m) - from fastest lap */
  length: number;
  /** Start/finish line */
  startFinish: StartFinishLine;
  /** Sector boundaries (4 sectors = 4 boundaries at 1/4, 1/2, 3/4 of lap) */
  sectors: SectorBoundary[];
}

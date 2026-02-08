/**
 * Base data types for VBO Track Viewer
 */

/**
 * 2D vector for directions and perpendiculars
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * VBO file header with metadata
 */
export interface VBOHeader {
  fileCreated?: string;
  columnNames: string[];
  comments: string[];
}

/**
 * Single GPS track point from VBO file
 */
export interface VBODataRow {
  // GPS data
  sats: number; // Satellite count
  time: string; // Time in HH:MM:SS.mmm format
  lat: number; // Latitude (decimal degrees)
  long: number; // Longitude (decimal degrees)
  velocity: number; // Speed (km/h)
  heading: number; // Heading (degrees)
  height: number; // Altitude (m)

  // Metric coordinates (meters from origin)
  x: number; // X (east-west)
  y: number; // Y (north-south)

  // Derived
  deltaTime?: number; // Time from previous point (ms)
  distance?: number; // Distance to previous point (m)
  direction?: Vector2D; // Movement direction (normalized)
  perpendicular?: Vector2D; // Perpendicular to direction

  // Lap context
  lapTimeFromStart?: number; // Time from lap start (ms)
  lapDistanceFromStart?: number; // Distance from lap start (m)

  // Flags
  isInterpolated?: boolean; // Point created by interpolation (at intersection)
}

/**
 * Track bounds (bounding box)
 */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLong: number;
  maxLong: number;
  centerLat: number;
  centerLong: number;
  width: number; // In degrees
  height: number; // In degrees
}

/**
 * Start/finish line for lap detection
 */
export interface StartFinishLine {
  point: { lat: number; long: number }; // Position in GPS
  pointMeters: { x: number; y: number }; // Position in meters
  direction: Vector2D; // Movement direction across line
  perpendicular: Vector2D; // Perpendicular (line direction)
  width: number; // Detection line width (m)
}

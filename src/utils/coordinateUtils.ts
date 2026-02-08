/**
 * Utilities for GPS coordinates and conversion
 */

/**
 * Convert GPS coordinates to meters relative to origin
 * Uses local equirectangular projection. Good for small distances (up to a few km).
 * @param lat Point latitude (degrees)
 * @param long Point longitude (degrees)
 * @param originLat Origin latitude (degrees)
 * @param originLong Origin longitude (degrees)
 * @returns Coordinates in meters { x: east-west, y: north-south }
 */
export function gpsToMeters(
  lat: number,
  long: number,
  originLat: number,
  originLong: number,
): { x: number; y: number } 
{
  // Earth radius in meters
  const R = 6371000;

  // Convert to radians
  const latRad = (lat * Math.PI) / 180;
  const longRad = (long * Math.PI) / 180;
  const originLatRad = (originLat * Math.PI) / 180;
  const originLongRad = (originLong * Math.PI) / 180;

  // Coordinate difference
  const dLat = latRad - originLatRad;
  const dLong = longRad - originLongRad;

  // Equirectangular projection: x = east-west (longitude), y = north-south (latitude)
  const x = dLong * R * Math.cos(originLatRad);
  const y = dLat * R;

  return { x, y };
}

/**
 * Convert metric coordinates back to GPS
 * @param x X in meters (east-west)
 * @param y Y in meters (north-south)
 * @param originLat Origin latitude (degrees)
 * @param originLong Origin longitude (degrees)
 * @returns GPS { lat, long } in degrees
 */
export function metersToGps(
  x: number,
  y: number,
  originLat: number,
  originLong: number,
): { lat: number; long: number } 
{
  const R = 6371000;
  const originLatRad = (originLat * Math.PI) / 180;

  // Inverse conversion
  const dLat = y / R;
  const dLong = x / (R * Math.cos(originLatRad));

  const lat = originLat + (dLat * 180) / Math.PI;
  const long = originLong + (dLong * 180) / Math.PI;

  return { lat, long };
}

/**
 * Haversine distance between two GPS points
 * @param lat1 First point latitude (degrees)
 * @param lon1 First point longitude (degrees)
 * @param lat2 Second point latitude (degrees)
 * @param lon2 Second point longitude (degrees)
 * @returns Distance in meters
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number 
{
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert VBO format coordinates to decimal degrees.
 * VBO stores coordinates in arc minutes. Longitude sign is inverted.
 *
 * @param vboCoord Coordinate in VBO format (arc minutes)
 * @param isLatitude true for latitude, false for longitude
 * @returns Coordinate in decimal degrees
 */
export function vboToDecimal(vboCoord: number, isLatitude: boolean): number 
{
  // Arc minutes to degrees
  let degrees = vboCoord / 60;

  // Longitude is inverted
  if (!isLatitude) 
  {
    degrees = -degrees;
  }

  return degrees;
}

/**
 * Parse time from HHMMSS.mmm string to milliseconds
 * @param timeStr Time in HHMMSS.mmm format
 * @returns Time in milliseconds
 */
export function parseTimeToMs(timeStr: string): number 
{
  const hh = parseInt(timeStr.substring(0, 2), 10);
  const mm = parseInt(timeStr.substring(2, 4), 10);
  const ss = parseFloat(timeStr.substring(4));
  return (hh * 3600 + mm * 60 + ss) * 1000;
}

/**
 * Parse time from HH:MM:SS.mmm string to milliseconds
 * @param timeStr Time in HH:MM:SS.mmm format
 * @returns Time in milliseconds
 */
export function parseFormattedTimeToMs(timeStr: string): number 
{
  if (!timeStr) return 0;

  const parts = timeStr.split(":");
  if (parts.length !== 3) return 0;

  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const ss = parseFloat(parts[2]);

  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return 0;

  return (hh * 3600 + mm * 60 + ss) * 1000;
}

/**
 * Format time from HHMMSS.mmm to HH:MM:SS.mmm
 * @param timeStr Time in HHMMSS.mmm format
 * @returns Time in HH:MM:SS.mmm format
 */
export function formatVBOTime(timeStr: string): string 
{
  if (timeStr.length < 6) return timeStr;

  const hh = timeStr.substring(0, 2);
  const mm = timeStr.substring(2, 4);
  const ss = timeStr.substring(4);

  return `${hh}:${mm}:${ss}`;
}

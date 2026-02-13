/**
 * Tile system for Google Maps
 */

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Web Mercator projection (matches tile coordinate system).
 * Returns normalized coordinates 0..1 for the world.
 */
export function latLngToMercator(lat: number, lng: number): { x: number; y: number } 
{
  const latClamp = Math.max(-85.051129, Math.min(85.051129, lat));
  const x = (lng + 180) / 360;
  const latRad = (latClamp * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return { x, y };
}

/**
 * Inverse Web Mercator: normalized 0..1 to lat/lng.
 */
export function mercatorToLatLng(x: number, y: number): LatLng 
{
  const lng = x * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/**
 * Convert lat/lng to tile coordinates
 */
export function latLngToTile(lat: number, lng: number, zoom: number): TileCoord 
{
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

/**
 * Convert tile coordinates back to lat/lng (top-left corner)
 */
export function tileToLatLng(x: number, y: number, zoom: number): LatLng 
{
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

/** Maximum zoom level for Google Maps satellite */
const MAX_TILE_ZOOM = 21;

/** Target tile count at start - balance between speed and sharpness (~40-60) */
const TARGET_INITIAL_TILES = 50;

/**
 * Compute zoom for given bbox - start with ~50 tiles for balance of speed and detail.
 * Returns the highest zoom where tile count <= TARGET_INITIAL_TILES.
 * More detailed tiles load as user zooms in.
 */
export function calculateZoom(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  _canvasWidth: number,
  _canvasHeight: number,
): number 
{
  let bestZoom = 1;

  for (let zoom = 1; zoom <= MAX_TILE_ZOOM; zoom++) 
  {
    const topLeft = latLngToTile(maxLat, minLng, zoom);
    const bottomRight = latLngToTile(minLat, maxLng, zoom);

    const tilesX = bottomRight.x - topLeft.x + 1;
    const tilesY = bottomRight.y - topLeft.y + 1;
    const totalTiles = tilesX * tilesY;

    if (totalTiles <= TARGET_INITIAL_TILES) 
    {
      bestZoom = zoom;
    }
    else 
    {
      break; // Exceeded target - use previous zoom
    }
  }

  return bestZoom;
}

/**
 * Get list of tiles for bbox. expandFactor = area expansion (2 = 2x each side)
 */
export function getTilesForBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  zoom: number,
  expandFactor: number = 2,
): TileCoord[] 
{
  const topLeft = latLngToTile(maxLat, minLng, zoom);
  const bottomRight = latLngToTile(minLat, maxLng, zoom);

  // Expand tile load area
  const width = bottomRight.x - topLeft.x + 1;
  const height = bottomRight.y - topLeft.y + 1;
  const extraX = Math.floor((width * (expandFactor - 1)) / 2);
  const extraY = Math.floor((height * (expandFactor - 1)) / 2);

  const startX = Math.max(0, topLeft.x - extraX);
  const endX = bottomRight.x + extraX;
  const startY = Math.max(0, topLeft.y - extraY);
  const endY = bottomRight.y + extraY;

  const tiles: TileCoord[] = [];
  for (let x = startX; x <= endX; x++) 
  {
    for (let y = startY; y <= endY; y++) 
    {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

/**
 * Check if tile (x,y,z) is fully covered by higher-zoom tiles up to maxDrawZoom.
 * Only considers tiles at z' where z < z' <= maxDrawZoom (we don't draw tiles above maxDrawZoom).
 */
export function isTileFullyCovered(
  x: number,
  y: number,
  z: number,
  tiles: Map<string, HTMLImageElement>,
  maxDrawZoom: number,
): boolean 
{
  const tileKey = (zx: number, zy: number, zz: number) => `${zz}/${zx}/${zy}`;

  for (let zPrime = z + 1; zPrime <= maxDrawZoom; zPrime++) 
  {
    const d = Math.pow(2, zPrime - z);
    const startX = x * d;
    const startY = y * d;
    const endX = (x + 1) * d - 1;
    const endY = (y + 1) * d - 1;

    let allPresent = true;
    for (let tx = startX; tx <= endX && allPresent; tx++) 
    {
      for (let ty = startY; ty <= endY && allPresent; ty++) 
      {
        if (!tiles.has(tileKey(tx, ty, zPrime))) 
        {
          allPresent = false;
        }
      }
    }
    if (allPresent) return true;
  }
  return false;
}

export type TileSource = "google" | "osm";

/**
 * Google Maps tile URL (satellite)
 */
export function getGoogleTileUrl(tile: TileCoord): string 
{
  const server = Math.floor(Math.random() * 4);
  return `https://mt${server}.google.com/vt/lyrs=s&x=${tile.x}&y=${tile.y}&z=${tile.z}`;
}

/**
 * OpenStreetMap tile URL
 */
export function getOSMTileUrl(tile: TileCoord): string 
{
  const server = ["a", "b", "c"][Math.floor(Math.random() * 3)];
  return `https://${server}.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
}

/**
 * Tile URL by source
 */
export function getTileUrl(tile: TileCoord, source: TileSource = "google"): string 
{
  return source === "google" ? getGoogleTileUrl(tile) : getOSMTileUrl(tile);
}

/**
 * Tile cache with size limit
 */
export class TileCache 
{
  private cache = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<HTMLImageElement>>();
  private maxSize = 1000;
  private source: TileSource;

  constructor(source: TileSource = "google") 
  {
    this.source = source;
  }

  private getKey(tile: TileCoord): string 
  {
    return `${this.source}:${tile.z}/${tile.x}/${tile.y}`;
  }

  async load(tile: TileCoord): Promise<HTMLImageElement> 
  {
    const key = this.getKey(tile);

    const cached = this.cache.get(key);
    if (cached?.complete) return cached;

    const loading = this.loading.get(key);
    if (loading) return loading;

    const promise = this.loadImage(tile);
    this.loading.set(key, promise);

    try 
    {
      const img = await promise;
      this.addToCache(key, img);
      return img;
    }
    finally 
    {
      this.loading.delete(key);
    }
  }

  private loadImage(tile: TileCoord): Promise<HTMLImageElement> 
  {
    return new Promise((resolve, reject) => 
    {
      const img = new Image();
      const timeout = setTimeout(() => 
      {
        img.src = "";
        reject(new Error("Timeout"));
      }, 8000);

      img.onload = () => 
      {
        clearTimeout(timeout);
        if (img.naturalWidth > 0) 
        {
          resolve(img);
        }
        else 
        {
          img.src = "";
          reject(new Error("Invalid"));
        }
      };

      img.onerror = () => 
      {
        clearTimeout(timeout);
        img.src = "";
        reject(new Error("Load failed"));
      };

      img.src = getTileUrl(tile, this.source);
    });
  }

  private addToCache(key: string, img: HTMLImageElement) 
  {
    if (this.cache.size >= this.maxSize) 
    {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, 10);
      keysToDelete.forEach((k) => 
      {
        const oldImg = this.cache.get(k);
        if (oldImg) oldImg.src = "";
        this.cache.delete(k);
      });
    }
    this.cache.set(key, img);
  }

  clear() 
  {
    this.cache.forEach((img) => (img.src = ""));
    this.cache.clear();
    this.loading.clear();
  }

  size() 
  {
    return this.cache.size;
  }
}

/**
 * Tile system для Google Maps
 */

export interface TileCoord {
  x: number
  y: number
  z: number
}

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Конвертирует lat/lng в тайловые координаты
 */
export function latLngToTile(lat: number, lng: number, zoom: number): TileCoord {
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y, z: zoom }
}

/**
 * Конвертирует тайловые координаты обратно в lat/lng (верхний левый угол)
 */
export function tileToLatLng(x: number, y: number, zoom: number): LatLng {
  const n = Math.pow(2, zoom)
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  const lat = (latRad * 180) / Math.PI
  return { lat, lng }
}

/**
 * Вычисляет оптимальный zoom для заданного bbox
 */
export function calculateZoom(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  for (let zoom = 18; zoom >= 1; zoom--) {
    const topLeft = latLngToTile(maxLat, minLng, zoom)
    const bottomRight = latLngToTile(minLat, maxLng, zoom)
    
    const tilesX = bottomRight.x - topLeft.x + 1
    const tilesY = bottomRight.y - topLeft.y + 1
    
    if (tilesX * 256 <= canvasWidth * 1.5 && tilesY * 256 <= canvasHeight * 1.5) {
      return zoom
    }
  }
  return 1
}

/**
 * Получает список тайлов для bbox
 * expandFactor - коэффициент расширения области (2 = в 2 раза больше по каждой стороне)
 */
export function getTilesForBounds(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  zoom: number,
  expandFactor: number = 2
): TileCoord[] {
  const topLeft = latLngToTile(maxLat, minLng, zoom)
  const bottomRight = latLngToTile(minLat, maxLng, zoom)
  
  // Расширяем область загрузки тайлов
  const width = bottomRight.x - topLeft.x + 1
  const height = bottomRight.y - topLeft.y + 1
  const extraX = Math.floor((width * (expandFactor - 1)) / 2)
  const extraY = Math.floor((height * (expandFactor - 1)) / 2)
  
  const startX = Math.max(0, topLeft.x - extraX)
  const endX = bottomRight.x + extraX
  const startY = Math.max(0, topLeft.y - extraY)
  const endY = bottomRight.y + extraY
  
  const tiles: TileCoord[] = []
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      tiles.push({ x, y, z: zoom })
    }
  }
  return tiles
}

export type TileSource = 'google' | 'osm'

/**
 * URL тайла Google Maps (satellite)
 */
export function getGoogleTileUrl(tile: TileCoord): string {
  const server = Math.floor(Math.random() * 4)
  return `https://mt${server}.google.com/vt/lyrs=s&x=${tile.x}&y=${tile.y}&z=${tile.z}`
}

/**
 * URL тайла OpenStreetMap
 */
export function getOSMTileUrl(tile: TileCoord): string {
  const server = ['a', 'b', 'c'][Math.floor(Math.random() * 3)]
  return `https://${server}.tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`
}

/**
 * URL тайла в зависимости от источника
 */
export function getTileUrl(tile: TileCoord, source: TileSource = 'google'): string {
  return source === 'google' ? getGoogleTileUrl(tile) : getOSMTileUrl(tile)
}

/**
 * Кэш тайлов с ограничением размера
 */
export class TileCache {
  private cache = new Map<string, HTMLImageElement>()
  private loading = new Map<string, Promise<HTMLImageElement>>()
  private maxSize = 100
  private source: TileSource

  constructor(source: TileSource = 'google') {
    this.source = source
  }

  private getKey(tile: TileCoord): string {
    return `${this.source}:${tile.z}/${tile.x}/${tile.y}`
  }

  async load(tile: TileCoord): Promise<HTMLImageElement> {
    const key = this.getKey(tile)
    
    const cached = this.cache.get(key)
    if (cached?.complete) return cached
    
    const loading = this.loading.get(key)
    if (loading) return loading
    
    const promise = this.loadImage(tile)
    this.loading.set(key, promise)
    
    try {
      const img = await promise
      this.addToCache(key, img)
      return img
    } finally {
      this.loading.delete(key)
    }
  }

  private loadImage(tile: TileCoord): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const timeout = setTimeout(() => {
        img.src = ''
        reject(new Error('Timeout'))
      }, 8000)
      
      img.onload = () => {
        clearTimeout(timeout)
        if (img.naturalWidth > 0) {
          resolve(img)
        } else {
          img.src = ''
          reject(new Error('Invalid'))
        }
      }
      
      img.onerror = () => {
        clearTimeout(timeout)
        img.src = ''
        reject(new Error('Load failed'))
      }
      
      img.src = getTileUrl(tile, this.source)
    })
  }

  private addToCache(key: string, img: HTMLImageElement) {
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, 10)
      keysToDelete.forEach(k => {
        const oldImg = this.cache.get(k)
        if (oldImg) oldImg.src = ''
        this.cache.delete(k)
      })
    }
    this.cache.set(key, img)
  }

  clear() {
    this.cache.forEach(img => img.src = '')
    this.cache.clear()
    this.loading.clear()
  }

  size() {
    return this.cache.size
  }
}

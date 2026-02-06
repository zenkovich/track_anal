import { useCallback, useEffect, useRef, useState } from 'react'
import { TileCache, calculateZoom, getTilesForBounds, tileToLatLng } from '../utils/tiles'
import { VBOData } from '../models/VBOData'
import { metersToGps, gpsToMeters } from '../utils/vboParser'
import './TrackVisualizer.css'

interface TrackVisualizerProps {
  data: VBOData
  showTiles?: boolean
  onToggleTiles?: () => void
  onReset?: () => void
  resetKey?: number
  showDebugPanel?: boolean
  updateCounter?: number // Для принудительной перерисовки
}

interface ViewState {
  offsetX: number
  offsetY: number
  scale: number
}

interface TrackPoint {
  lapIndex: number
  lapColor: string
  lapName: string
  distance: number // Дистанция от начала круга (м)
  time: string // Время от начала круга
  velocity: number // Скорость (км/ч)
  x: number // Экранная координата X
  y: number // Экранная координата Y
}

export function TrackVisualizer({ data, showTiles: showTilesProp = true, resetKey, showDebugPanel: showDebugPanelProp = false, updateCounter = 0 }: TrackVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  
  const [viewState, setViewState] = useState<ViewState>({
    offsetX: 0,
    offsetY: 0,
    scale: 1
  })
  
  const [baseParams, setBaseParams] = useState<{
    baseScale: number
    centerX: number
    centerY: number
  } | null>(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  const [tiles, setTiles] = useState<Map<string, HTMLImageElement>>(new Map())
  const [tileZoom, setTileZoom] = useState(0)
  const [showTileBorders, setShowTileBorders] = useState(false)
  const [showTileLabels, setShowTileLabels] = useState(false)
  const [showStartFinishDebug, setShowStartFinishDebug] = useState(false)
  const [showHoverDebug, setShowHoverDebug] = useState(false)
  const tileCacheRef = useRef(new TileCache('google'))
  
  const [hoveredPoints, setHoveredPoints] = useState<TrackPoint[]>([])
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [debugHoverData, setDebugHoverData] = useState<{
    mouseMeters: { x: number; y: number }
    searchRadius: number
    minDistance: number
    checkedSegments: Array<{
      p1: { x: number; y: number }
      p2: { x: number; y: number }
      proj: { x: number; y: number }
      dist: number
      inRange: boolean
    }>
  } | null>(null)
  
  const showTiles = showTilesProp
  const showDebugPanel = showDebugPanelProp

  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0 && data.rows.length > 0) {
      const bbox = data.boundingBox
      const padding = 40
      
      const debug: string[] = []
      debug.push('=== VBO Track Viewer ===')
      debug.push(`Points: ${data.rows.length}`)
      
      // Проверяем несколько точек
      const p1 = data.rows[0]
      const p2 = data.rows[Math.floor(data.rows.length / 2)]
      const p3 = data.rows[data.rows.length - 1]
      
      debug.push(`Start: ${p1.lat.toFixed(4)}, ${p1.long.toFixed(4)}`)
      debug.push(`Mid: ${p2.lat.toFixed(4)}, ${p2.long.toFixed(4)}`)
      debug.push(`End: ${p3.lat.toFixed(4)}, ${p3.long.toFixed(4)}`)
      debug.push(`Area: ${(bbox.width * 111).toFixed(2)}km x ${(bbox.height * 111).toFixed(2)}km`)
      
      let interpolatedCount = 0
      data.laps.forEach(lap => {
        lap.rows.forEach(row => {
          if (row.isInterpolated) interpolatedCount++
        })
      })
      if (interpolatedCount > 0) {
        debug.push(`Interpolated points: ${interpolatedCount}`)
      }
      
      // Определяем где мы находимся
      let location = ''
      if (p1.lat > 0 && p1.long > 0) location = 'NE (Европа/Азия)'
      else if (p1.lat > 0 && p1.long < 0) location = 'NW (Америка/Атлантика)'
      else if (p1.lat < 0 && p1.long > 0) location = 'SE (Африка/Океания)'
      else location = 'SW (Юж.Америка/Океан)'
      
      debug.push(`Location: ${location}`)
      debug.push(`Laps: ${data.laps.length}`)
      
      const availableWidth = dimensions.width - 2 * padding
      const availableHeight = dimensions.height - 2 * padding
      
      const scaleX = availableWidth / bbox.width
      const scaleY = availableHeight / bbox.height
      const baseScale = Math.min(scaleX, scaleY)
      
      const centerX = bbox.centerLong
      const centerY = bbox.centerLat
      
      const zoom = calculateZoom(
        bbox.minLat,
        bbox.maxLat,
        bbox.minLong,
        bbox.maxLong,
        dimensions.width,
        dimensions.height
      )
      
      debug.push(`Tile zoom: ${zoom}`)
      setTileZoom(zoom)
      setDebugInfo(debug)
      setBaseParams({ baseScale, centerX, centerY })
      
      setViewState({
        offsetX: dimensions.width / 2,
        offsetY: dimensions.height / 2,
        scale: 1
      })
    }
  }, [dimensions, data])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = rect.width
        const newHeight = rect.height
        
        setDimensions(prev => {
          if (prev.width !== newWidth || prev.height !== newHeight) {
            return { width: newWidth, height: newHeight }
          }
          return prev
        })
      }
    }
    
    // Начальный размер
    updateDimensions()
    
    // ResizeObserver для отслеживания изменения размера контейнера
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    // Также слушаем window resize на всякий случай
    window.addEventListener('resize', updateDimensions)
    
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [])

  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0) {
      setViewState({
        offsetX: dimensions.width / 2,
        offsetY: dimensions.height / 2,
        scale: 1
      })
    }
  }, [resetKey, dimensions.width, dimensions.height])

  useEffect(() => {
    if (!tileZoom || !data.rows.length || !showTiles) {
      setTiles(new Map())
      return
    }

    let cancelled = false
    const bbox = data.boundingBox
    const tilesToLoad = getTilesForBounds(
      bbox.minLat,
      bbox.maxLat,
      bbox.minLong,
      bbox.maxLong,
      tileZoom
    )

    const loadTiles = async () => {
      const loaded = new Map<string, HTMLImageElement>()
      const cache = tileCacheRef.current

      for (const tile of tilesToLoad) {
        if (cancelled) break
        try {
          const img = await cache.load(tile)
          if (!cancelled) {
            loaded.set(`${tile.z}/${tile.x}/${tile.y}`, img)
          }
        } catch (err) {
          // Игнорируем ошибки загрузки отдельных тайлов
        }
      }

      if (!cancelled) {
        setTiles(loaded)
      }
    }

    loadTiles()

    return () => {
      cancelled = true
    }
  }, [tileZoom, data.boundingBox, showTiles])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      tileCacheRef.current.clear()
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    setViewState(prev => {
      const newScale = Math.max(0.1, Math.min(50, prev.scale * zoomFactor))
      const worldX = (mouseX - prev.offsetX) / prev.scale
      const worldY = (mouseY - prev.offsetY) / prev.scale
      return {
        offsetX: mouseX - worldX * newScale,
        offsetY: mouseY - worldY * newScale,
        scale: newScale
      }
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - viewState.offsetX, y: e.clientY - viewState.offsetY })
  }, [viewState.offsetX, viewState.offsetY])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setViewState(prev => ({
        ...prev,
        offsetX: e.clientX - dragStart.x,
        offsetY: e.clientY - dragStart.y
      }))
    } else {
      // Обработка hover для показа параметров траектории
      const canvas = canvasRef.current
      if (!canvas || !baseParams) return
      
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      setMousePos({ x: mouseX, y: mouseY })
      
      // Конвертация экранных координат в world координаты (локальные координаты canvas)
      const worldX = (mouseX - viewState.offsetX) / viewState.scale
      const worldY = (mouseY - viewState.offsetY) / viewState.scale
      
      // Конвертация world координат в GPS координаты
      const mouseLong = worldX / baseParams.baseScale + baseParams.centerX
      const mouseLat = -worldY / baseParams.baseScale + baseParams.centerY
      
      // Конвертация GPS в метрические координаты трека (те же что в VBODataRow.x, VBODataRow.y)
      const bbox = data.boundingBox
      const mouseMeters = gpsToMeters(mouseLat, mouseLong, bbox.minLat, bbox.minLong)
      
      // Конвертация пикселей в метры
      // 1 пиксель на экране = (1 / viewState.scale) локальных единиц
      // 1 локальная единица = (1 / baseParams.baseScale) градусов
      // 1 градус ≈ 111км на широте bbox.centerLat
      const metersPerDegree = 111000 * Math.cos((bbox.centerLat * Math.PI) / 180)
      const metersPerLocalUnit = metersPerDegree / baseParams.baseScale
      const metersPerPixel = metersPerLocalUnit / viewState.scale
      
      // Трешхолд: 50 пикселей
      const minDistancePixels = 50
      const minDistanceMeters = minDistancePixels * metersPerPixel
      const searchRadiusMeters = minDistanceMeters * 2
      
      const checkedSegments: Array<{
        p1: { x: number; y: number }
        p2: { x: number; y: number }
        proj: { x: number; y: number }
        dist: number
        inRange: boolean
      }> = []
      
      const foundPoints: TrackPoint[] = []
      
      // Ищем ближайшие точки для каждого видимого круга
      data.laps.forEach((lap) => {
        if (!lap.visible) return
        
        let closestDist = Infinity
        let closestPoint: TrackPoint | null = null
        
        const rows = lap.rows
        
        for (let i = 1; i < rows.length; i++) {
          const p1 = rows[i - 1]
          const p2 = rows[i]
          
          // Быстрая проверка: отбрасываем далекие сегменты
          const minX = Math.min(p1.x, p2.x) - searchRadiusMeters
          const maxX = Math.max(p1.x, p2.x) + searchRadiusMeters
          const minY = Math.min(p1.y, p2.y) - searchRadiusMeters
          const maxY = Math.max(p1.y, p2.y) + searchRadiusMeters
          
          if (mouseMeters.x < minX || mouseMeters.x > maxX || 
              mouseMeters.y < minY || mouseMeters.y > maxY) {
            continue
          }
          
          // Вычисляем проекцию курсора на отрезок
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const segmentLength = Math.sqrt(dx * dx + dy * dy)
          
          if (segmentLength < 0.001) continue
          
          // Параметр t проекции [0, 1]
          const t = Math.max(0, Math.min(1, 
            ((mouseMeters.x - p1.x) * dx + (mouseMeters.y - p1.y) * dy) / (segmentLength * segmentLength)
          ))
          
          // Точка проекции на отрезке
          const projX = p1.x + t * dx
          const projY = p1.y + t * dy
          
          // Расстояние от курсора до проекции
          const dist = Math.sqrt(
            (mouseMeters.x - projX) * (mouseMeters.x - projX) + 
            (mouseMeters.y - projY) * (mouseMeters.y - projY)
          )
          
          // Сохраняем для debug отрисовки
          checkedSegments.push({
            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            proj: { x: projX, y: projY },
            dist: dist,
            inRange: dist < minDistanceMeters
          })
          
          if (dist < minDistanceMeters && dist < closestDist) {
            closestDist = dist
            
            // Интерполируем параметры
            const velocity = p1.velocity + t * (p2.velocity - p1.velocity)
            
            // Интерполируем дистанцию от начала круга (используем предрасчитанные значения)
            const p1DistFromStart = p1.lapDistanceFromStart || 0
            const p2DistFromStart = p2.lapDistanceFromStart || 0
            const distanceFromStart = p1DistFromStart + t * (p2DistFromStart - p1DistFromStart)
            
            // Форматируем время как в списке кругов: M:SS.mmm
            const formatTimeTooltip = (ms: number): string => {
              if (isNaN(ms) || ms < 0) return '0:00.000'
              const totalSeconds = ms / 1000
              const minutes = Math.floor(totalSeconds / 60)
              const secondsRemainder = totalSeconds - (minutes * 60)
              const secWhole = Math.floor(secondsRemainder)
              const secFrac = Math.floor((secondsRemainder - secWhole) * 1000)
              return `${minutes}:${secWhole.toString().padStart(2, '0')}.${secFrac.toString().padStart(3, '0')}`
            }
            
            // Интерполируем время от начала круга (используем предрасчитанные значения)
            const p1TimeFromStart = p1.lapTimeFromStart || 0
            const p2TimeFromStart = p2.lapTimeFromStart || 0
            const timeFromStart = p1TimeFromStart + t * (p2TimeFromStart - p1TimeFromStart)
            
            // Debug вывод времени для первого близкого сегмента каждого круга
            if (showHoverDebug && lap.index <= 2 && dist < minDistanceMeters && closestDist === Infinity) {
              console.log(`[Hover] Lap ${lap.index}, segment ${i}/${rows.length}, dist=${dist.toFixed(2)}m:`)
              console.log(`  p1: time="${p1.time}", lapTimeFromStart=${p1.lapTimeFromStart}, using=${p1TimeFromStart}ms`)
              console.log(`  p2: time="${p2.time}", lapTimeFromStart=${p2.lapTimeFromStart}, using=${p2TimeFromStart}ms`)
              console.log(`  t=${t.toFixed(3)}, result=${timeFromStart.toFixed(1)}ms = ${formatTimeTooltip(timeFromStart)}`)
              
              // Проверяем точки круга
              console.log(`  Lap has ${rows.length} points, first.time="${rows[0].time}", last.time="${rows[rows.length-1].time}"`)
            }
            
            // Конвертируем проекцию (метры) обратно в экранные координаты
            // 1. Метры -> GPS
            const projGps = metersToGps(projX, projY, bbox.minLat, bbox.minLong)
            // 2. GPS -> локальные координаты canvas
            const projLocalX = (projGps.long - baseParams.centerX) * baseParams.baseScale
            const projLocalY = -(projGps.lat - baseParams.centerY) * baseParams.baseScale
            // 3. Локальные -> экранные
            const screenX = projLocalX * viewState.scale + viewState.offsetX
            const screenY = projLocalY * viewState.scale + viewState.offsetY
            
            closestPoint = {
              lapIndex: lap.index,
              lapColor: lap.color,
              lapName: `Lap ${lap.index + 1}`,
              distance: distanceFromStart,
              time: formatTimeTooltip(timeFromStart),
              velocity: velocity,
              x: screenX,
              y: screenY
            }
          }
        }
        
        if (closestPoint) {
          foundPoints.push(closestPoint)
        }
      })
      
      setHoveredPoints(foundPoints)
      setDebugHoverData({
        mouseMeters,
        searchRadius: searchRadiusMeters,
        minDistance: minDistanceMeters,
        checkedSegments
      })
      
      // Debug: показываем конвертацию только при включенном debug режиме
      if (showHoverDebug && checkedSegments.length > 0) {
        console.log(`[Hover] metersPerPixel: ${metersPerPixel.toFixed(4)}m, minDistance: ${minDistanceMeters.toFixed(2)}m (${minDistancePixels}px)`)
        console.log(`[Hover] Checked segments: ${checkedSegments.length}, in range: ${checkedSegments.filter(s => s.inRange).length}`)
      }
    }
  }, [isDragging, dragStart.x, dragStart.y, viewState, baseParams, data, showHoverDebug])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    setHoveredPoints([])
    setMousePos(null)
    setDebugHoverData(null)
  }, [])

  const toggleTileBorders = () => {
    setShowTileBorders(prev => !prev)
  }

  const toggleTileLabels = () => {
    setShowTileLabels(prev => !prev)
  }

  const toggleStartFinishDebug = () => {
    setShowStartFinishDebug(prev => !prev)
  }
  
  const toggleHoverDebug = () => {
    setShowHoverDebug(prev => !prev)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.rows.length === 0 || !baseParams) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Отменяем предыдущий кадр если он есть
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Используем requestAnimationFrame для оптимизации
    animationFrameRef.current = requestAnimationFrame(() => {
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

    const bbox = data.boundingBox
    ctx.save()
    ctx.translate(viewState.offsetX, viewState.offsetY)
    ctx.scale(viewState.scale, viewState.scale)

    const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale
    const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale

    // Отрисовка тайлов
    if (tiles.size > 0) {
      tiles.forEach((img, key) => {
        const [z, x, y] = key.split('/').map(Number)
        const topLeft = tileToLatLng(x, y, z)
        const bottomRight = tileToLatLng(x + 1, y + 1, z)
        
        const localX = toLocalX(topLeft.lng)
        const localY = toLocalY(topLeft.lat)
        const width = (bottomRight.lng - topLeft.lng) * baseParams.baseScale
        const height = -(bottomRight.lat - topLeft.lat) * baseParams.baseScale
        
        ctx.drawImage(img, localX, localY, width, height)
        
        // Границы тайлов
        if (showTileBorders) {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
          ctx.lineWidth = 2 / viewState.scale
          ctx.strokeRect(localX, localY, width, height)
        }
        
        // Нумерация тайлов
        if (showTileLabels) {
          ctx.save()
          ctx.resetTransform()
          const screenX = (localX * viewState.scale) + viewState.offsetX
          const screenY = (localY * viewState.scale) + viewState.offsetY
          ctx.fillStyle = 'rgba(255, 255, 0, 0.9)'
          ctx.font = 'bold 12px monospace'
          ctx.fillText(`${x},${y}`, screenX + 5, screenY + 15)
          ctx.restore()
          ctx.translate(viewState.offsetX, viewState.offsetY)
          ctx.scale(viewState.scale, viewState.scale)
        }
      })
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1 / viewState.scale
    ctx.strokeRect(
      toLocalX(bbox.minLong),
      toLocalY(bbox.maxLat),
      (bbox.maxLong - bbox.minLong) * baseParams.baseScale,
      (bbox.maxLat - bbox.minLat) * baseParams.baseScale
    )

    // Отрисовка линии старт-финиш (ДО кругов, чтобы быть под ними)
    if (data.startFinish) {
      const sf = data.startFinish
      
      // Клетчатая полоса - два ряда в шахматном порядке
      const squareCount = 10
      const squareWidthMeters = sf.width / squareCount // ширина квадрата в метрах
      const rowCount = 2
      const rowHeightMeters = 4 // высота ряда в метрах
      
      for (let row = 0; row < rowCount; row++) {
        for (let i = 0; i < squareCount; i++) {
          // Позиция квадрата вдоль линии
          const alongLineStart = (i - squareCount / 2) * squareWidthMeters
          const alongLineEnd = ((i + 1) - squareCount / 2) * squareWidthMeters
          const perpDistStart = row * rowHeightMeters
          const perpDistEnd = (row + 1) * rowHeightMeters
          
          // 4 угла квадрата в метрах
          const corner1X_m = sf.pointMeters.x + sf.perpendicular.x * alongLineStart + sf.direction.x * perpDistStart
          const corner1Y_m = sf.pointMeters.y + sf.perpendicular.y * alongLineStart + sf.direction.y * perpDistStart
          const corner2X_m = sf.pointMeters.x + sf.perpendicular.x * alongLineEnd + sf.direction.x * perpDistStart
          const corner2Y_m = sf.pointMeters.y + sf.perpendicular.y * alongLineEnd + sf.direction.y * perpDistStart
          const corner3X_m = sf.pointMeters.x + sf.perpendicular.x * alongLineEnd + sf.direction.x * perpDistEnd
          const corner3Y_m = sf.pointMeters.y + sf.perpendicular.y * alongLineEnd + sf.direction.y * perpDistEnd
          const corner4X_m = sf.pointMeters.x + sf.perpendicular.x * alongLineStart + sf.direction.x * perpDistEnd
          const corner4Y_m = sf.pointMeters.y + sf.perpendicular.y * alongLineStart + sf.direction.y * perpDistEnd
          
          // Конвертируем в GPS
          const c1 = metersToGps(corner1X_m, corner1Y_m, bbox.minLat, bbox.minLong)
          const c2 = metersToGps(corner2X_m, corner2Y_m, bbox.minLat, bbox.minLong)
          const c3 = metersToGps(corner3X_m, corner3Y_m, bbox.minLat, bbox.minLong)
          const c4 = metersToGps(corner4X_m, corner4Y_m, bbox.minLat, bbox.minLong)
          
          // Шахматный порядок - менее контрастный
          const isOrange = (i + row) % 2 === 0
          ctx.fillStyle = isOrange ? '#FF6B00' : '#2a2a2a'
          ctx.strokeStyle = 'rgba(255, 107, 0, 0.5)'
          ctx.lineWidth = 1 / viewState.scale
          
          ctx.beginPath()
          ctx.moveTo(toLocalX(c1.long), toLocalY(c1.lat))
          ctx.lineTo(toLocalX(c2.long), toLocalY(c2.lat))
          ctx.lineTo(toLocalX(c3.long), toLocalY(c3.lat))
          ctx.lineTo(toLocalX(c4.long), toLocalY(c4.lat))
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }
    }

    // Отрисовка кругов разными цветами (ПОВЕРХ линии старт-финиш)
    ctx.lineWidth = 3 / viewState.scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    // Убираем яркое свечение
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    // Отрисовка видимых кругов
    data.laps.forEach((lap) => {
      // Проверяем, виден ли этот круг
      if (!lap.visible) return
      
      ctx.strokeStyle = lap.color
      ctx.beginPath()
      const firstRow = lap.rows[0]
      ctx.moveTo(toLocalX(firstRow.long), toLocalY(firstRow.lat))
      for (let i = 1; i < lap.rows.length; i++) {
        const row = lap.rows[i]
        ctx.lineTo(toLocalX(row.long), toLocalY(row.lat))
      }
      ctx.stroke()
    })
    
    ctx.shadowColor = 'transparent'

    // Отладочная визуализация линии старт-финиш для детекции кругов
    if (showStartFinishDebug && data.startFinish) {
      const sf = data.startFinish
      const sfX = toLocalX(sf.point.long)
      const sfY = toLocalY(sf.point.lat)
      
      // Вычисляем две точки отрезка детекции ТОЧНО как в алгоритме (в метрах)
      const halfWidth = sf.width / 2
      const detectionX1_m = sf.pointMeters.x - sf.perpendicular.x * halfWidth
      const detectionY1_m = sf.pointMeters.y - sf.perpendicular.y * halfWidth
      const detectionX2_m = sf.pointMeters.x + sf.perpendicular.x * halfWidth
      const detectionY2_m = sf.pointMeters.y + sf.perpendicular.y * halfWidth
      
      // Конвертируем обратно в GPS
      const point1_gps = metersToGps(detectionX1_m, detectionY1_m, bbox.minLat, bbox.minLong)
      const point2_gps = metersToGps(detectionX2_m, detectionY2_m, bbox.minLat, bbox.minLong)
      
      // Конвертируем в локальные координаты канваса
      const perpX1 = toLocalX(point1_gps.long)
      const perpY1 = toLocalY(point1_gps.lat)
      const perpX2 = toLocalX(point2_gps.long)
      const perpY2 = toLocalY(point2_gps.lat)
      
      // Рисуем красную толстую линию детекции (конечный отрезок)
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'
      ctx.lineWidth = 5 / viewState.scale
      ctx.beginPath()
      ctx.moveTo(perpX1, perpY1)
      ctx.lineTo(perpX2, perpY2)
      ctx.stroke()
      
      // Рисуем концы отрезка (зеленые круги)
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)'
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
      ctx.lineWidth = 2 / viewState.scale
      const endPointSize = 6 / viewState.scale
      
      ctx.beginPath()
      ctx.arc(perpX1, perpY1, endPointSize, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      
      ctx.beginPath()
      ctx.arc(perpX2, perpY2, endPointSize, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      
      // Центральная точка старт-финиш (большой красный круг)
      ctx.fillStyle = 'rgba(255, 0, 0, 0.9)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
      ctx.lineWidth = 2 / viewState.scale
      const centerSize = 8 / viewState.scale
      ctx.beginPath()
      ctx.arc(sfX, sfY, centerSize, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      
      // Стрелка направления движения (синяя) - рисуем в метрах
      const arrowLengthMeters = sf.width * 1.5
      const arrowEndX_m = sf.pointMeters.x + sf.direction.x * arrowLengthMeters
      const arrowEndY_m = sf.pointMeters.y + sf.direction.y * arrowLengthMeters
      const arrowEnd_gps = metersToGps(arrowEndX_m, arrowEndY_m, bbox.minLat, bbox.minLong)
      const dirEndX = toLocalX(arrowEnd_gps.long)
      const dirEndY = toLocalY(arrowEnd_gps.lat)
      const arrowHeadSize = 10 / viewState.scale
      
      ctx.strokeStyle = 'rgba(0, 100, 255, 0.9)'
      ctx.fillStyle = 'rgba(0, 100, 255, 0.9)'
      ctx.lineWidth = 3 / viewState.scale
      ctx.beginPath()
      ctx.moveTo(sfX, sfY)
      ctx.lineTo(dirEndX, dirEndY)
      ctx.stroke()
      
      // Головка стрелки
      const angle = Math.atan2(-sf.direction.y, sf.direction.x)
      ctx.beginPath()
      ctx.moveTo(dirEndX, dirEndY)
      ctx.lineTo(
        dirEndX - arrowHeadSize * Math.cos(angle - Math.PI / 6),
        dirEndY - arrowHeadSize * Math.sin(angle - Math.PI / 6)
      )
      ctx.lineTo(
        dirEndX - arrowHeadSize * Math.cos(angle + Math.PI / 6),
        dirEndY - arrowHeadSize * Math.sin(angle + Math.PI / 6)
      )
      ctx.closePath()
      ctx.fill()
      
      // Рисуем интерполированные точки (оранжевые)
      data.laps.forEach(lap => {
        lap.rows.forEach(row => {
          if (row.isInterpolated) {
            const x = toLocalX(row.long)
            const y = toLocalY(row.lat)
            ctx.fillStyle = 'rgba(255, 165, 0, 0.9)'
            ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
            ctx.lineWidth = 2 / viewState.scale
            const interpSize = 7 / viewState.scale
            ctx.beginPath()
            ctx.arc(x, y, interpSize, 0, 2 * Math.PI)
            ctx.fill()
            ctx.stroke()
          }
        })
      })
    }

    const pointSize = 6 / viewState.scale
    ctx.lineWidth = 2 / viewState.scale
    ctx.fillStyle = '#00ff00'
    ctx.strokeStyle = '#000'
    ctx.beginPath()
    ctx.arc(toLocalX(data.rows[0].long), toLocalY(data.rows[0].lat), pointSize, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    const last = data.rows[data.rows.length - 1]
    ctx.fillStyle = '#0000ff'
    ctx.beginPath()
    ctx.arc(toLocalX(last.long), toLocalY(last.lat), pointSize, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
    
    // === DEBUG ОТРИСОВКА HOVER (только если включена) ===
    if (showHoverDebug && debugHoverData && mousePos) {
      ctx.save()
      ctx.translate(viewState.offsetX, viewState.offsetY)
      ctx.scale(viewState.scale, viewState.scale)
      
      const md = debugHoverData
      
      // Конвертируем метры в локальные координаты canvas
      const toLocalX = (long: number) => (long - baseParams.centerX) * baseParams.baseScale
      const toLocalY = (lat: number) => -(lat - baseParams.centerY) * baseParams.baseScale
      
      // Конвертируем метры трека в GPS, затем в локальные
      const mouseGps = metersToGps(md.mouseMeters.x, md.mouseMeters.y, bbox.minLat, bbox.minLong)
      const mouseLX = toLocalX(mouseGps.long)
      const mouseLY = toLocalY(mouseGps.lat)
      
      // 1. Перекрестие курсора
      ctx.strokeStyle = '#FFFF00'
      ctx.lineWidth = 2 / viewState.scale
      const crossSize = 15 / viewState.scale
      ctx.beginPath()
      ctx.moveTo(mouseLX - crossSize, mouseLY)
      ctx.lineTo(mouseLX + crossSize, mouseLY)
      ctx.moveTo(mouseLX, mouseLY - crossSize)
      ctx.lineTo(mouseLX, mouseLY + crossSize)
      ctx.stroke()
      
      // 2. Круг search radius (x2 от min distance)
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
      ctx.lineWidth = 1 / viewState.scale
      const searchRadiusLocal = md.searchRadius * baseParams.baseScale
      ctx.beginPath()
      ctx.arc(mouseLX, mouseLY, searchRadiusLocal, 0, 2 * Math.PI)
      ctx.stroke()
      
      // 3. Круг min distance
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'
      ctx.lineWidth = 2 / viewState.scale
      const minDistLocal = md.minDistance * baseParams.baseScale
      ctx.beginPath()
      ctx.arc(mouseLX, mouseLY, minDistLocal, 0, 2 * Math.PI)
      ctx.stroke()
      
      // 4. Проверенные сегменты и проекции
      md.checkedSegments.forEach(seg => {
        // Конвертируем точки сегмента из метров в локальные координаты
        const p1Gps = metersToGps(seg.p1.x, seg.p1.y, bbox.minLat, bbox.minLong)
        const p2Gps = metersToGps(seg.p2.x, seg.p2.y, bbox.minLat, bbox.minLong)
        const projGps = metersToGps(seg.proj.x, seg.proj.y, bbox.minLat, bbox.minLong)
        
        const p1LX = toLocalX(p1Gps.long)
        const p1LY = toLocalY(p1Gps.lat)
        const p2LX = toLocalX(p2Gps.long)
        const p2LY = toLocalY(p2Gps.lat)
        const projLX = toLocalX(projGps.long)
        const projLY = toLocalY(projGps.lat)
        
        // Рисуем сегмент (проверенная часть траектории)
        ctx.strokeStyle = seg.inRange ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.5)'
        ctx.lineWidth = 3 / viewState.scale
        ctx.beginPath()
        ctx.moveTo(p1LX, p1LY)
        ctx.lineTo(p2LX, p2LY)
        ctx.stroke()
        
        // Рисуем проекцию (линия от курсора к проекции)
        ctx.strokeStyle = seg.inRange ? 'rgba(0, 255, 0, 0.6)' : 'rgba(255, 0, 0, 0.4)'
        ctx.lineWidth = 1 / viewState.scale
        ctx.setLineDash([5 / viewState.scale, 5 / viewState.scale])
        ctx.beginPath()
        ctx.moveTo(mouseLX, mouseLY)
        ctx.lineTo(projLX, projLY)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Точка проекции
        ctx.fillStyle = seg.inRange ? '#00FF00' : '#FF0000'
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1 / viewState.scale
        const projSize = 5 / viewState.scale
        ctx.beginPath()
        ctx.arc(projLX, projLY, projSize, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
      })
      
      ctx.restore()
      
      // Координаты курсора (в экранных координатах) - вписываем в canvas
      ctx.save()
      
      const inRangeCount = md.checkedSegments.filter(s => s.inRange).length
      const panelWidth = 260
      const panelHeight = 80
      
      // Вписываем в область canvas
      let panelX = mousePos.x + 20
      let panelY = mousePos.y - panelHeight
      
      if (panelX + panelWidth > canvas.width) {
        panelX = mousePos.x - panelWidth - 20
      }
      if (panelY < 0) {
        panelY = mousePos.y + 20
      }
      if (panelX < 0) panelX = 10
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight)
      ctx.strokeStyle = '#FFFF00'
      ctx.lineWidth = 1
      ctx.strokeRect(panelX, panelY, panelWidth, panelHeight)
      
      ctx.font = '11px monospace'
      let yOffset = panelY + 15
      
      ctx.fillStyle = '#FFFF00'
      ctx.fillText(`Screen: (${mousePos.x.toFixed(0)}, ${mousePos.y.toFixed(0)})`, panelX + 5, yOffset)
      yOffset += 13
      
      ctx.fillStyle = '#00FF00'
      ctx.fillText(`Meters: (${md.mouseMeters.x.toFixed(1)}, ${md.mouseMeters.y.toFixed(1)})`, panelX + 5, yOffset)
      yOffset += 13
      
      ctx.fillStyle = '#FF6B00'
      ctx.fillText(`Threshold: ${md.minDistance.toFixed(2)}m (50px)`, panelX + 5, yOffset)
      yOffset += 13
      
      ctx.fillStyle = inRangeCount > 0 ? '#00FF00' : '#FF0000'
      ctx.fillText(`Segments: ${md.checkedSegments.length} (${inRangeCount} in range)`, panelX + 5, yOffset)
      yOffset += 13
      
      ctx.fillStyle = hoveredPoints.length > 0 ? '#00FF00' : '#FFFFFF'
      ctx.fillText(`Found: ${hoveredPoints.length} points`, panelX + 5, yOffset)
      
      ctx.restore()
    }
    
    // Hover точки (финальные найденные точки) - всегда показываются
    if (hoveredPoints.length > 0 && !showHoverDebug) {
      ctx.save()
      ctx.translate(viewState.offsetX, viewState.offsetY)
      ctx.scale(viewState.scale, viewState.scale)
      
      hoveredPoints.forEach(point => {
        // Конвертируем экранные координаты точки в локальные canvas
        const localX = (point.x - viewState.offsetX) / viewState.scale
        const localY = (point.y - viewState.offsetY) / viewState.scale
        
        // Рисуем точку на траектории
        ctx.fillStyle = point.lapColor
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3 / viewState.scale
        const hoverPointSize = 8 / viewState.scale
        ctx.beginPath()
        ctx.arc(localX, localY, hoverPointSize, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
        
        // Рисуем круг вокруг точки
        ctx.strokeStyle = point.lapColor
        ctx.lineWidth = 2 / viewState.scale
        ctx.beginPath()
        ctx.arc(localX, localY, hoverPointSize * 1.8, 0, 2 * Math.PI)
        ctx.stroke()
      })
      
      ctx.restore()
    }

    ctx.restore()
    })

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data.rows, dimensions, viewState, baseParams, debugInfo, tiles, showTileBorders, showTileLabels, showStartFinishDebug, showHoverDebug, updateCounter, hoveredPoints, mousePos, debugHoverData])

  return (
    <div className="track-visualizer" ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="track-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
      />
      
      {/* Tooltip с параметрами траектории */}
      {hoveredPoints.length > 0 && mousePos && (() => {
        // Размеры tooltip (примерные)
        const tooltipWidth = 200
        const tooltipHeight = 50 + hoveredPoints.length * 75
        const offset = 15
        
        // Вписываем в область canvas
        let left = mousePos.x + offset
        let top = mousePos.y + offset
        
        // Проверка выхода за правый край
        if (left + tooltipWidth > dimensions.width) {
          left = mousePos.x - tooltipWidth - offset
        }
        
        // Проверка выхода за нижний край
        if (top + tooltipHeight > dimensions.height) {
          top = mousePos.y - tooltipHeight - offset
        }
        
        // Проверка выхода за левый край
        if (left < 0) {
          left = offset
        }
        
        // Проверка выхода за верхний край
        if (top < 0) {
          top = offset
        }
        
        return (
          <div 
            className="track-tooltip"
            style={{
              left: `${left}px`,
              top: `${top}px`
            }}
          >
          {hoveredPoints.map((point, idx) => (
            <div key={idx} className="track-tooltip-item">
              <div className="track-tooltip-header">
                <span 
                  className="track-tooltip-color"
                  style={{ backgroundColor: point.lapColor }}
                ></span>
                <span className="track-tooltip-lap">{point.lapName}</span>
              </div>
              <div className="track-tooltip-params">
                <div className="track-tooltip-param">
                  <span className="track-tooltip-label">Distance:</span>
                  <span className="track-tooltip-value">{(point.distance / 1000).toFixed(3)} km</span>
                </div>
                <div className="track-tooltip-param">
                  <span className="track-tooltip-label">Time:</span>
                  <span className="track-tooltip-value">{point.time}</span>
                </div>
                <div className="track-tooltip-param">
                  <span className="track-tooltip-label">Speed:</span>
                  <span className="track-tooltip-value">{point.velocity.toFixed(1)} km/h</span>
                </div>
              </div>
            </div>
          ))}
          </div>
        )
      })()}
      
      {showDebugPanel && (
        <div className="debug-panel">
          <div className="debug-panel-header">
            <h3>VBO Track Viewer Debug</h3>
          </div>
          <div className="debug-panel-content">
            <div className="debug-section">
              <h4>Track Info</h4>
              {debugInfo.map((line, i) => (
                <div key={i} className="debug-line">{line}</div>
              ))}
            </div>
            <div className="debug-section">
              <h4>Tile Settings</h4>
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showTileBorders}
                  onChange={toggleTileBorders}
                />
                <span>Show tile borders</span>
              </label>
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showTileLabels}
                  onChange={toggleTileLabels}
                />
                <span>Show tile labels</span>
              </label>
              <div className="debug-line">Loaded tiles: {tiles.size}</div>
              <div className="debug-line">Cache size: {tileCacheRef.current.size()}</div>
            </div>
            <div className="debug-section">
              <h4>Hover Detection</h4>
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showHoverDebug}
                  onChange={toggleHoverDebug}
                />
                <span>Show hover debug</span>
              </label>
            </div>
            <div className="debug-section">
              <h4>Start/Finish Detection</h4>
              <label className="debug-checkbox">
                <input
                  type="checkbox"
                  checked={showStartFinishDebug}
                  onChange={toggleStartFinishDebug}
                />
                <span>Show detection line</span>
              </label>
              {data.startFinish && (
                <>
                  <div className="debug-line">Position: ({data.startFinish.pointMeters.x.toFixed(2)}, {data.startFinish.pointMeters.y.toFixed(2)})m</div>
                  <div className="debug-line">Direction: ({data.startFinish.direction.x.toFixed(4)}, {data.startFinish.direction.y.toFixed(4)})</div>
                  <div className="debug-line">Perpendicular: ({data.startFinish.perpendicular.x.toFixed(4)}, {data.startFinish.perpendicular.y.toFixed(4)})</div>
                  <div className="debug-line">Width: {data.startFinish.width}m</div>
                  <div className="debug-line" style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '4px' }}>
                    Detection segment endpoints:
                  </div>
                  <div className="debug-line" style={{ fontSize: '0.7rem', color: '#0f0' }}>
                    P1: ({(data.startFinish.pointMeters.x - data.startFinish.perpendicular.x * data.startFinish.width / 2).toFixed(2)}, {(data.startFinish.pointMeters.y - data.startFinish.perpendicular.y * data.startFinish.width / 2).toFixed(2)})m
                  </div>
                  <div className="debug-line" style={{ fontSize: '0.7rem', color: '#0f0' }}>
                    P2: ({(data.startFinish.pointMeters.x + data.startFinish.perpendicular.x * data.startFinish.width / 2).toFixed(2)}, {(data.startFinish.pointMeters.y + data.startFinish.perpendicular.y * data.startFinish.width / 2).toFixed(2)})m
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { TileCache, calculateZoom, getTilesForBounds, tileToLatLng } from '../utils/tiles'
import { VBOData, metersToGps } from '../utils/vboParser'
import './TrackVisualizer.css'

interface TrackVisualizerProps {
  data: VBOData
  showTiles?: boolean
  onToggleTiles?: () => void
  onReset?: () => void
  resetKey?: number
  visibleLaps?: Set<number>
  showDebugPanel?: boolean
}

interface ViewState {
  offsetX: number
  offsetY: number
  scale: number
}

export function TrackVisualizer({ data, showTiles: showTilesProp = true, resetKey, visibleLaps: visibleLapsProp, showDebugPanel: showDebugPanelProp = false }: TrackVisualizerProps) {
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
  const tileCacheRef = useRef(new TileCache('google'))
  
  const showTiles = showTilesProp
  const visibleLaps = visibleLapsProp || new Set(data.laps.map((_, idx) => idx))
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
    }
  }, [isDragging, dragStart.x, dragStart.y])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
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
      ctx.fillStyle = '#f8f9fa'
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

    ctx.strokeStyle = '#999'
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
          
          // Шахматный порядок
          const isWhite = (i + row) % 2 === 0
          ctx.fillStyle = isWhite ? '#ffffff' : '#000000'
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = 2 / viewState.scale
          
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
    
    if (tiles.size > 0) {
      ctx.shadowColor = 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = 3 / viewState.scale
    }

    const lapColors = [
      '#ff0000', // красный
      '#00ff00', // зеленый
      '#0000ff', // синий
      '#ffff00', // желтый
      '#ff00ff', // пурпурный
      '#00ffff', // циан
      '#ff8800', // оранжевый
      '#8800ff', // фиолетовый
    ]

    data.laps.forEach((lap, lapIdx) => {
      // Проверяем, виден ли этот круг
      if (!visibleLaps.has(lapIdx)) return
      
      ctx.strokeStyle = lapColors[lapIdx % lapColors.length]
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
    })

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data.rows, dimensions, viewState, baseParams, debugInfo, tiles, visibleLaps, showTileBorders, showTileLabels, showStartFinishDebug])

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
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      />
      
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

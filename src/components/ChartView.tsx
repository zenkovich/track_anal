import { useEffect, useRef, useState } from 'react'
import { VBOData } from '../models/VBOData'
import { ChartType, CHART_TYPES } from '../models/charts'
import './ChartView.css'

interface ChartViewProps {
  data: VBOData
  chartType: ChartType
  updateCounter: number
  xZoom: number
  xPan: number
  yZoom: number
  yPan: number
  onXZoomChange: (zoom: number) => void
  onXPanChange: (pan: number) => void
  onYZoomChange: (zoom: number) => void
  onYPanChange: (pan: number) => void
  sharedCursorDistance: number | null
  sharedMouseX: number | null
  onSharedCursorChange: (distance: number | null, mouseX: number | null) => void
  lapOrder: number[]
}

interface ChartValue {
  lapIndex: number
  lapColor: string
  lapName: string
  value: number
  isFastest: boolean
}

export function ChartView({ 
  data, 
  chartType, 
  updateCounter,
  xZoom,
  xPan,
  yZoom,
  yPan,
  onXZoomChange,
  onXPanChange,
  onYZoomChange,
  onYPanChange,
  sharedCursorDistance,
  sharedMouseX,
  onSharedCursorChange,
  lapOrder
}: ChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [chartValues, setChartValues] = useState<ChartValue[]>([])

  // Отслеживаем изменения размеров контейнера
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect()
      setDimensions({ width: rect.width, height: rect.height })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Пересчитываем значения при изменении общей дистанции курсора
  useEffect(() => {
    if (sharedCursorDistance !== null && sharedCursorDistance >= 0) {
      const visibleLaps = data.getVisibleLaps()
      const fastestLapIndex = data.getFastestVisibleLap()
      const values: ChartValue[] = []
      
      visibleLaps.forEach(lap => {
        const chart = lap.getChart(chartType)
        if (!chart) return
        
        const value = chart.getValueAtDistance(sharedCursorDistance)
        if (value === null) return
        
        values.push({
          lapIndex: lap.index,
          lapColor: lap.color,
          lapName: `Lap ${lap.index + 1}`,
          value: value,
          isFastest: lap.index === fastestLapIndex
        })
      })
      
      // Сортируем значения согласно порядку в таблице
      if (lapOrder.length > 0 && values.length > 1) {
        const orderMap = new Map<number, number>()
        lapOrder.forEach((lapIndex, position) => {
          orderMap.set(lapIndex, position)
        })
        
        values.sort((a, b) => {
          const posA = orderMap.get(a.lapIndex)
          const posB = orderMap.get(b.lapIndex)
          
          if (posA === undefined || posB === undefined) {
            return a.lapIndex - b.lapIndex
          }
          
          return posA - posB
        })
      }
      
      setChartValues(values)
    } else {
      setChartValues([])
    }
  }, [sharedCursorDistance, data, chartType, lapOrder])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = dimensions.width
    canvas.height = dimensions.height

    // Очищаем canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Получаем видимые круги
    const visibleLaps = data.getVisibleLaps()
    if (visibleLaps.length === 0) return

    // Находим максимальную дистанцию среди всех видимых кругов
    let maxDistance = 0
    visibleLaps.forEach(lap => {
      const lastPoint = lap.rows[lap.rows.length - 1]
      if (lastPoint.lapDistanceFromStart) {
        maxDistance = Math.max(maxDistance, lastPoint.lapDistanceFromStart)
      }
    })

    if (maxDistance === 0) return

    // Находим общий диапазон Y для всех видимых кругов
    let minY = Infinity
    let maxY = -Infinity
    visibleLaps.forEach(lap => {
      const chart = lap.getChart(chartType)
      if (chart) {
        minY = Math.min(minY, chart.getMinValue())
        maxY = Math.max(maxY, chart.getMaxValue())
      }
    })

    if (minY === Infinity || maxY === -Infinity) return

    // Добавляем padding для Y
    const yRange = maxY - minY
    const yPadding = yRange * 0.1
    minY -= yPadding
    maxY += yPadding

    const padding = { left: 50, right: 20, top: 20, bottom: 30 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom

    // Центр графика для zoom/pan трансформаций
    const centerX = chartWidth / 2
    const centerY = chartHeight / 2

    // Функции конвертации координат с учетом zoom и pan
    const toScreenX = (distance: number) => {
      const normalizedX = distance / maxDistance // [0, 1]
      const baseX = normalizedX * chartWidth // Базовая позиция без zoom/pan
      // Применяем zoom относительно центра, затем pan
      return padding.left + (baseX - centerX) * xZoom + centerX + xPan
    }
    
    const toScreenY = (value: number) => {
      const normalizedY = (value - minY) / (maxY - minY) // [0, 1]
      const baseY = normalizedY * chartHeight // Базовая позиция без zoom/pan
      // Применяем zoom относительно центра, затем pan (Y инвертирован)
      return canvas.height - padding.bottom - ((baseY - centerY) * yZoom + centerY + yPan)
    }

    // Рисуем оси
    ctx.strokeStyle = '#404040'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, canvas.height - padding.bottom)
    ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom)
    ctx.stroke()

    // Рисуем сетку по Y (5 линий)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 1
    ctx.font = '11px monospace'
    ctx.fillStyle = '#808080'
    for (let i = 0; i <= 4; i++) {
      const value = minY + (maxY - minY) * (i / 4)
      const y = toScreenY(value)
      
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.stroke()
      
      ctx.fillText(value.toFixed(1), 5, y + 4)
    }

    // Рисуем графики для каждого видимого круга
    visibleLaps.forEach(lap => {
      const chart = lap.getChart(chartType)
      if (!chart || chart.points.length === 0) return

      ctx.strokeStyle = lap.color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.beginPath()
      const firstPoint = chart.points[0]
      ctx.moveTo(toScreenX(firstPoint.distance), toScreenY(firstPoint.value))

      for (let i = 1; i < chart.points.length; i++) {
        const point = chart.points[i]
        ctx.lineTo(toScreenX(point.distance), toScreenY(point.value))
      }

      ctx.stroke()
    })

    // Получаем название графика
    const sampleChart = visibleLaps[0]?.getChart(chartType)
    if (sampleChart) {
      // Рисуем название и единицы
      ctx.fillStyle = '#e0e0e0'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`${sampleChart.name} (${sampleChart.unit})`, padding.left + 5, 15)
      
      // Показываем zoom/pan если не по умолчанию
      if (xZoom !== 1 || yZoom !== 1 || xPan !== 0 || yPan !== 0) {
        ctx.fillStyle = '#808080'
        ctx.font = '10px monospace'
        ctx.fillText(`zoom: ${xZoom.toFixed(1)}x, ${yZoom.toFixed(1)}x`, canvas.width - padding.right - 100, 15)
      }
    }

    // Рисуем проекцию курсора на графики (точки и линии дельт)
    if (sharedCursorDistance !== null && sharedCursorDistance >= 0) {
      // Вычисляем X позицию линии на этом графике
      const normalizedX = sharedCursorDistance / maxDistance
      const centerX = chartWidth / 2
      const baseX = normalizedX * chartWidth
      const lineX = padding.left + (baseX - centerX) * xZoom + centerX + xPan
      
      // Рисуем точки проекции и линии дельт
      const fastestLapIndex = data.getFastestVisibleLap()
      let referenceValue: number | null = null
      let referenceY: number | null = null
      
      // Сначала находим референсное значение (лучший круг)
      if (fastestLapIndex !== null) {
        const refLap = data.laps[fastestLapIndex]
        if (refLap && refLap.visible) {
          const refChart = refLap.getChart(chartType)
          if (refChart) {
            referenceValue = refChart.getValueAtDistance(sharedCursorDistance)
            if (referenceValue !== null) {
              referenceY = toScreenY(referenceValue)
            }
          }
        }
      }
      
      // Рисуем точки и линии дельт для каждого круга
      visibleLaps.forEach(lap => {
        const chart = lap.getChart(chartType)
        if (!chart) return
        
        const value = chart.getValueAtDistance(sharedCursorDistance)
        if (value === null) return
        
        const pointY = toScreenY(value)
        const isFastest = lap.index === fastestLapIndex
        
        // Рисуем линию дельты (если не самый быстрый и есть референс)
        if (!isFastest && referenceY !== null && referenceValue !== null) {
          const delta = value - referenceValue
          
          // Определяем цвет на основе higherIsBetter
          let lineColor: string
          if (chart.higherIsBetter) {
            // Больше лучше: положительная дельта = зеленый
            lineColor = delta > 0 ? '#00ff00' : '#ff6666'
          } else {
            // Меньше лучше: отрицательная дельта = зеленый
            lineColor = delta < 0 ? '#00ff00' : '#ff6666'
          }
          
          ctx.strokeStyle = lineColor
          ctx.lineWidth = 2
          ctx.setLineDash([3, 3])
          
          ctx.beginPath()
          ctx.moveTo(lineX, referenceY)
          ctx.lineTo(lineX, pointY)
          ctx.stroke()
          
          ctx.setLineDash([])
        }
        
        // Рисуем точку проекции (в 2 раза меньше)
        ctx.fillStyle = lap.color
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        const pointSize = 2.5
        
        ctx.beginPath()
        ctx.arc(lineX, pointY, pointSize, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
      })
    }
    
    // Рисуем горизонтальную линию от локального курсора (только если курсор над этим графиком)
    if (mousePos) {
      const mouseX = mousePos.x
      const mouseY = mousePos.y
      
      if (mouseX >= padding.left && mouseX <= canvas.width - padding.right &&
          mouseY >= padding.top && mouseY <= canvas.height - padding.bottom) {
        
        ctx.strokeStyle = '#FF6B00'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        
        // Горизонтальная линия
        ctx.beginPath()
        ctx.moveTo(padding.left, mouseY)
        ctx.lineTo(canvas.width - padding.right, mouseY)
        ctx.stroke()
        
        ctx.setLineDash([])
      }
    }

  }, [data, chartType, dimensions, updateCounter, xZoom, xPan, yZoom, yPan, mousePos, sharedCursorDistance, sharedMouseX])

  // Обработчик zoom (колесо мыши) - zoom относительно курсора
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const padding = { left: 50, right: 20, top: 20, bottom: 30 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const shiftPressed = e.shiftKey
    
    if (shiftPressed) {
      // Только Y zoom при нажатом Shift
      const mouseChartY = mouseY - padding.top
      const worldY = (mouseChartY / chartHeight - yPan) / yZoom
      
      const newYZoom = Math.max(0.1, Math.min(10, yZoom * zoomFactor))
      const newYPan = mouseChartY / chartHeight - worldY * newYZoom
      
      onYZoomChange(newYZoom)
      onYPanChange(newYPan)
    } else {
      // Zoom по обеим осям СИНХРОННО (одинаковые значения) относительно курсора
      const mouseChartX = mouseX - padding.left
      const mouseChartY = mouseY - padding.top
      
      // Берем текущее значение (среднее если разные)
      const currentZoom = (xZoom + yZoom) / 2
      let newZoom = currentZoom * zoomFactor
      
      // Применяем ограничения
      newZoom = Math.max(1, Math.min(5, newZoom))
      
      const newXPan = xPan + (mouseChartX - chartWidth / 2) * (1 - newZoom / xZoom)
      const newYPan = yPan + (mouseChartY - chartHeight / 2) * (1 - newZoom / yZoom)
      
      // Устанавливаем ОДИНАКОВЫЙ zoom для обеих осей
      onXZoomChange(newZoom)
      onXPanChange(newXPan)
      onYZoomChange(newZoom)
      onYPanChange(newYPan)
    }
  }

  // Обработчики pan (перетаскивание)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Обновляем позицию курсора для перекрестия
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    setMousePos({ x: mouseX, y: mouseY })
    
    // Вычисляем значения в точке курсора для всех кругов
    const padding = { left: 50, right: 20, top: 20, bottom: 30 }
    
    if (!isDragging && mouseX >= padding.left && mouseX <= canvas.width - padding.right &&
        mouseY >= padding.top && mouseY <= canvas.height - padding.bottom) {
      
      const chartWidth = canvas.width - padding.left - padding.right
      const centerX = chartWidth / 2
      
      // Получаем максимальную дистанцию
      const visibleLaps = data.getVisibleLaps()
      let maxDistance = 0
      visibleLaps.forEach(lap => {
        const lastPoint = lap.rows[lap.rows.length - 1]
        if (lastPoint.lapDistanceFromStart) {
          maxDistance = Math.max(maxDistance, lastPoint.lapDistanceFromStart)
        }
      })
      
      if (maxDistance > 0) {
        // Обратная конвертация: screenX -> distance
        const baseX = (mouseX - padding.left - centerX - xPan) / xZoom + centerX
        const normalizedX = baseX / chartWidth
        const distance = normalizedX * maxDistance
        
        // Отправляем общую дистанцию для всех графиков
        onSharedCursorChange(distance, mouseX)
      } else {
        onSharedCursorChange(null, null)
      }
    } else {
      onSharedCursorChange(null, null)
    }
    
    if (!isDragging) return
    
    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y
    
    // Pan напрямую в пикселях - движется синхронно с курсором
    onXPanChange(xPan + deltaX)
    onYPanChange(yPan - deltaY) // Инвертируем Y так как ось Y в canvas инвертирована
    
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setMousePos(null)
    onSharedCursorChange(null, null)
  }

  // Сброс zoom/pan
  const handleReset = () => {
    onXZoomChange(1)
    onXPanChange(0)
    onYZoomChange(1)
    onYPanChange(0)
  }

  const hasTransform = xZoom !== 1 || yZoom !== 1 || xPan !== 0 || yPan !== 0

  // Вычисляем референсное значение для дельты
  const fastestLapIndex = data.getFastestVisibleLap()
  const refValue = fastestLapIndex !== null 
    ? chartValues.find(v => v.lapIndex === fastestLapIndex)?.value 
    : null

  // Получаем название графика
  const chartName = CHART_TYPES.find(ct => ct.type === chartType)?.name || ''
  const sampleChart = data.getVisibleLaps()[0]?.getChart(chartType)
  const unit = sampleChart?.unit || ''

  return (
    <div className="chart-view" ref={containerRef}>
      <canvas 
        ref={canvasRef} 
        className="chart-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
      />
      {hasTransform && (
        <button 
          className="chart-reset-button"
          onClick={handleReset}
          title="Reset zoom/pan"
        >
          ⟲
        </button>
      )}
      
      {/* Tooltip с значениями - показывается всегда если есть sharedCursorDistance */}
      {chartValues.length > 0 && sharedCursorDistance !== null && sharedCursorDistance >= 0 && (() => {
        // Вычисляем позицию tooltip: используем sharedMouseX если есть, иначе вычисляем из sharedCursorDistance
        let tooltipX = 0
        if (sharedMouseX !== null) {
          tooltipX = Math.min(sharedMouseX + 15, dimensions.width - 180)
        } else {
          // Вычисляем позицию из sharedCursorDistance
          const visibleLaps = data.getVisibleLaps()
          let maxDistance = 0
          visibleLaps.forEach(lap => {
            const lastPoint = lap.rows[lap.rows.length - 1]
            if (lastPoint.lapDistanceFromStart) {
              maxDistance = Math.max(maxDistance, lastPoint.lapDistanceFromStart)
            }
          })
          if (maxDistance > 0) {
            const padding = { left: 50, right: 20, top: 20, bottom: 30 }
            const chartWidth = dimensions.width - padding.left - padding.right
            const centerX = chartWidth / 2
            const normalizedX = sharedCursorDistance / maxDistance
            const baseX = normalizedX * chartWidth
            const lineX = padding.left + (baseX - centerX) * xZoom + centerX + xPan
            tooltipX = Math.min(lineX + 15, dimensions.width - 180)
          }
        }
        
        return (
        <div 
          className="chart-tooltip"
          style={{
            left: `${tooltipX}px`,
            top: `10px`
          }}
        >
          <div className="chart-tooltip-title">{chartName} ({unit})</div>
          {chartValues.map(cv => {
            // Вычисляем дельту с учетом higherIsBetter
            let delta = null
            let deltaColor = ''
            if (refValue !== null && refValue !== undefined && !cv.isFastest) {
              const deltaVal = cv.value - refValue
              delta = deltaVal >= 0 ? `+${deltaVal.toFixed(2)}` : deltaVal.toFixed(2)
              
              // Определяем цвет на основе логики графика
              if (sampleChart?.higherIsBetter) {
                // Больше лучше: положительная дельта = зеленый
                deltaColor = deltaVal > 0 ? '#00ff00' : '#ff6666'
              } else {
                // Меньше лучше: отрицательная дельта = зеленый
                deltaColor = deltaVal < 0 ? '#00ff00' : '#ff6666'
              }
            }
            
            return (
              <div key={cv.lapIndex} className="chart-tooltip-row">
                <span className="chart-tooltip-color" style={{ backgroundColor: cv.lapColor }} />
                <span className="chart-tooltip-flag">{cv.isFastest ? '🏁' : ''}</span>
                <span className="chart-tooltip-lap">{cv.lapName}</span>
                <span className="chart-tooltip-value">{cv.value.toFixed(2)}</span>
                <span className="chart-tooltip-delta" style={{ color: delta ? deltaColor : 'transparent' }}>
                  {delta || ''}
                </span>
              </div>
            )
          })}
        </div>
        )
      })()}
    </div>
  )
}

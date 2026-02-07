import { useEffect, useRef, useState } from 'react'
import { VBOData } from '../models/VBOData'
import { ChartType } from '../models/charts'
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
  onYPanChange
}: ChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

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

    // Рисуем перекрестие от курсора
    if (mousePos) {
      const mouseX = mousePos.x
      const mouseY = mousePos.y
      
      // Проверяем что курсор в области графика
      if (mouseX >= padding.left && mouseX <= canvas.width - padding.right &&
          mouseY >= padding.top && mouseY <= canvas.height - padding.bottom) {
        
        ctx.strokeStyle = '#FF6B00'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        
        // Вертикальная линия
        ctx.beginPath()
        ctx.moveTo(mouseX, padding.top)
        ctx.lineTo(mouseX, canvas.height - padding.bottom)
        ctx.stroke()
        
        // Горизонтальная линия
        ctx.beginPath()
        ctx.moveTo(padding.left, mouseY)
        ctx.lineTo(canvas.width - padding.right, mouseY)
        ctx.stroke()
        
        ctx.setLineDash([])
      }
    }

  }, [data, chartType, dimensions, updateCounter, xZoom, xPan, yZoom, yPan, mousePos])

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
  }

  // Сброс zoom/pan
  const handleReset = () => {
    onXZoomChange(1)
    onXPanChange(0)
    onYZoomChange(1)
    onYPanChange(0)
  }

  const hasTransform = xZoom !== 1 || yZoom !== 1 || xPan !== 0 || yPan !== 0

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
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { VBOData } from '../models/VBOData'
import { ChartType } from '../models/charts'
import './ChartView.css'

interface ChartViewProps {
  data: VBOData
  chartType: ChartType
  updateCounter: number
}

export function ChartView({ data, chartType, updateCounter }: ChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 })

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

    // Функции конвертации координат
    const toScreenX = (distance: number) => padding.left + (distance / maxDistance) * chartWidth
    const toScreenY = (value: number) => canvas.height - padding.bottom - ((value - minY) / (maxY - minY)) * chartHeight

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
    }

  }, [data, chartType, dimensions, updateCounter])

  return (
    <div className="chart-view" ref={containerRef}>
      <canvas ref={canvasRef} className="chart-canvas" />
    </div>
  )
}

import { useState, useEffect } from 'react'
import { VBOData } from '../models/VBOData'
import { GraphIcon, VelocityIcon, TimeIcon, TimeDeltaIcon, VelocityDeltaIcon } from './Icons'
import { ChartView } from './ChartView'
import { ChartType, CHART_TYPES } from '../models/charts'
import './ChartsPanel.css'

// Маппинг иконок
const CHART_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  'VelocityIcon': VelocityIcon,
  'TimeIcon': TimeIcon,
  'TimeDeltaIcon': TimeDeltaIcon,
  'VelocityDeltaIcon': VelocityDeltaIcon
}

interface ChartsPanelProps {
  data: VBOData
  updateCounter: number
  lapOrder: number[]
  projectionDistance: number | null
  onProjectionDistanceChange: (distance: number | null) => void
}

export function ChartsPanel({ data, updateCounter, lapOrder = [], projectionDistance, onProjectionDistanceChange }: ChartsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [panelHeight, setPanelHeight] = useState(500)
  const [isResizing, setIsResizing] = useState(false)
  const [selectedCharts, setSelectedCharts] = useState<Set<ChartType>>(
    new Set(CHART_TYPES.map(ct => ct.type)) // По умолчанию все графики
  )
  const [chartFlexRatios, setChartFlexRatios] = useState<number[]>([]) // Flex grow для каждого графика
  const [resizingIndex, setResizingIndex] = useState<number | null>(null)
  const [resizeStartY, setResizeStartY] = useState<number>(0)
  
  // Общий zoom и pan по оси X для всех графиков
  const [xZoom, setXZoom] = useState(1)
  const [xPan, setXPan] = useState(0)
  
  // Индивидуальные zoom и pan по оси Y для каждого графика
  const [yZooms, setYZooms] = useState<Map<ChartType, number>>(new Map())
  const [yPans, setYPans] = useState<Map<ChartType, number>>(new Map())
  
  // Локальная позиция мыши для tooltip
  const [localMouseX, setLocalMouseX] = useState<number | null>(null)
  
  const toggleChart = (type: ChartType) => {
    const newSet = new Set(selectedCharts)
    if (newSet.has(type)) {
      newSet.delete(type)
    } else {
      newSet.add(type)
    }
    setSelectedCharts(newSet)
  }

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  // Инициализация flex ratios при изменении количества графиков
  useEffect(() => {
    const count = selectedCharts.size
    if (count === 0) return
    
    // Все графики получают равные flex grow
    setChartFlexRatios(Array(count).fill(1))
  }, [selectedCharts.size])

  // Resizer для всей панели
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = Math.min(Math.max(window.innerHeight - e.clientY, 150), window.innerHeight * 0.6)
      setPanelHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Resizer для разделителей между графиками
  const handleSeparatorMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    setResizingIndex(index)
    setResizeStartY(e.clientY)
  }

  useEffect(() => {
    if (resizingIndex === null) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY
      const deltaRatio = deltaY / (panelHeight - 40) * 2 // Чувствительность
      
      setChartFlexRatios(prev => {
        const newRatios = [...prev]
        
        if (resizingIndex + 1 < newRatios.length) {
          // Увеличиваем верхний график, уменьшаем нижний
          const newRatio1 = Math.max(0.2, newRatios[resizingIndex] + deltaRatio)
          const newRatio2 = Math.max(0.2, newRatios[resizingIndex + 1] - deltaRatio)
          
          newRatios[resizingIndex] = newRatio1
          newRatios[resizingIndex + 1] = newRatio2
        }
        
        return newRatios
      })
      
      setResizeStartY(e.clientY)
    }

    const handleMouseUp = () => {
      setResizingIndex(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingIndex, resizeStartY, panelHeight])

  return (
    <div 
      className={`charts-panel ${collapsed ? 'collapsed' : ''}`}
      style={{ height: collapsed ? '40px' : `${panelHeight}px` }}
    >
      {/* Resizer сверху панели */}
      {!collapsed && (
        <div 
          className="charts-resizer"
          onMouseDown={handleResizerMouseDown}
        >
          <div className="charts-resizer-handle"></div>
        </div>
      )}
      
      {/* Заголовок панели */}
      <div className="charts-panel-header">
        <button 
          className="collapse-button" 
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
        {!collapsed && (
          <>
            <h3><GraphIcon size={20} /> Graphs</h3>
            <div className="chart-icons-selector">
              {CHART_TYPES.map(chartType => {
                const IconComponent = CHART_ICONS[chartType.icon]
                const isSelected = selectedCharts.has(chartType.type)
                
                return (
                  <button
                    key={chartType.type}
                    className={`chart-icon-button ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleChart(chartType.type)}
                    title={chartType.name}
                  >
                    <IconComponent size={20} color={isSelected ? '#FF6B00' : '#505050'} />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Содержимое панели */}
      {!collapsed && (
        <div className="charts-panel-content">
          {selectedCharts.size === 0 ? (
            <div className="charts-placeholder">
              <GraphIcon size={48} color="#505050" />
              <p style={{ marginTop: '1rem' }}>No graphs selected</p>
              <p style={{ fontSize: '0.8rem', color: '#707070' }}>
                Click ⚙ to select graphs
              </p>
            </div>
          ) : (
            <div className="charts-container">
              {Array.from(selectedCharts).map((chartType, index) => {
                const flexGrow = chartFlexRatios[index] || 1
                return (
                  <>
                    <div 
                      key={chartType}
                      className="chart-wrapper"
                      style={{ flex: `${flexGrow} 1 0` }}
                    >
                      <ChartView 
                        data={data}
                        chartType={chartType}
                        updateCounter={updateCounter}
                        xZoom={xZoom}
                        xPan={xPan}
                        yZoom={yZooms.get(chartType) || 1}
                        yPan={yPans.get(chartType) || 0}
                        onXZoomChange={setXZoom}
                        onXPanChange={setXPan}
                        onYZoomChange={(zoom) => setYZooms(prev => new Map(prev).set(chartType, zoom))}
                        onYPanChange={(pan) => setYPans(prev => new Map(prev).set(chartType, pan))}
                        sharedCursorDistance={projectionDistance}
                        sharedMouseX={localMouseX}
                        onSharedCursorChange={(distance, mouseX) => {
                          onProjectionDistanceChange(distance)
                          setLocalMouseX(mouseX)
                        }}
                        lapOrder={lapOrder}
                      />
                    </div>
                    {index < selectedCharts.size - 1 && (
                      <div 
                        key={`sep-${index}`}
                        className="chart-separator"
                        onMouseDown={(e) => handleSeparatorMouseDown(index, e)}
                      >
                        <div className="chart-separator-handle"></div>
                      </div>
                    )}
                  </>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

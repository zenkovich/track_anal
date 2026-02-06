import { useState, useEffect } from 'react'
import { VBOData } from '../models/VBOData'
import './LapsPanel.css'

interface LapsPanelProps {
  data: VBOData
  onToggleLap: (lapIdx: number) => void
  onToggleAllLaps: (show: boolean) => void
  updateCounter: number // Для принудительной перерисовки
}

export function LapsPanel({ data, onToggleLap, onToggleAllLaps, updateCounter }: LapsPanelProps) {
  const [panelWidth, setPanelWidth] = useState(350)
  const [isResizing, setIsResizing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Принудительная перерисовка при изменении updateCounter
  useEffect(() => {
    // Просто триггерим ререндер
  }, [updateCounter])

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 250), window.innerWidth * 0.5)
      setPanelWidth(newWidth)
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

  if (data.laps.length <= 1) return null

  return (
    <div 
      className={`laps-panel-side ${collapsed ? 'collapsed' : ''}`}
      style={{ width: collapsed ? '40px' : `${panelWidth}px` }}
    >
      {!collapsed && (
        <div 
          className="laps-resizer-side"
          onMouseDown={handleResizerMouseDown}
        >
          <div className="laps-resizer-handle-side"></div>
        </div>
      )}
      
      <div className="laps-panel-header-side">
        <button 
          className="collapse-button-side" 
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '◀' : '▶'}
        </button>
        {!collapsed && (
          <>
            <h3>🏁 Laps ({data.laps.length})</h3>
            <label className="lap-checkbox-all" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={data.laps.every(lap => lap.visible)}
                onChange={(e) => onToggleAllLaps(e.target.checked)}
              />
              <span>All</span>
            </label>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="laps-panel-content-side">
          <table className="laps-table-side">
            <thead>
              <tr>
                <th className="col-checkbox"></th>
                <th className="col-color"></th>
                <th className="col-lap">Lap</th>
                <th className="col-distance">Distance</th>
                <th className="col-time">Time</th>
                <th className="col-speed">Max Speed</th>
              </tr>
            </thead>
            <tbody>
              {data.laps.map((lap) => {
                const stats = lap.getStats()
                
                return (
                  <tr key={lap.index} className={lap.visible ? 'active' : ''}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={lap.visible}
                        onChange={() => onToggleLap(lap.index)}
                      />
                    </td>
                    <td className="col-color">
                      <span 
                        className="lap-color-box"
                        style={{ backgroundColor: lap.color }}
                      ></span>
                    </td>
                    <td className="col-lap">{stats.name}</td>
                    <td className="col-distance">{(stats.distance / 1000).toFixed(2)} km</td>
                    <td className="col-time">{stats.timeFormatted}</td>
                    <td className="col-speed">{stats.maxSpeed} km/h</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

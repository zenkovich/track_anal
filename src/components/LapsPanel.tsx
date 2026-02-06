import { useState, useEffect } from 'react'
import { VBOData } from '../utils/vboParser'
import './LapsPanel.css'

interface LapsPanelProps {
  data: VBOData
  visibleLaps: Set<number>
  onToggleLap: (lapIdx: number) => void
  onToggleAllLaps: (show: boolean) => void
}

export function LapsPanel({ data, visibleLaps, onToggleLap, onToggleAllLaps }: LapsPanelProps) {
  const [panelWidth, setPanelWidth] = useState(350)
  const [isResizing, setIsResizing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const lapColors = [
    '#ff0000', '#00ff00', '#0000ff', '#ffff00',
    '#ff00ff', '#00ffff', '#ff8800', '#8800ff'
  ]

  const getLapStats = (lap: typeof data.laps[0]) => {
    const totalDistance = lap.rows.reduce((sum, row) => sum + (row.distance || 0), 0)
    const maxVelocity = Math.max(...lap.rows.map(row => row.velocity))
    
    const firstTime = lap.rows[0]?.time || '00:00:00'
    const lastTime = lap.rows[lap.rows.length - 1]?.time || '00:00:00'
    
    const parseTime = (timeStr: string): number => {
      const parts = timeStr.split(':')
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
    }
    
    const totalTime = parseTime(lastTime) - parseTime(firstTime)
    
    const minutes = Math.floor(totalTime / 60)
    const seconds = Math.floor(totalTime % 60)
    const milliseconds = Math.floor((totalTime % 1) * 1000)
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`
    
    return {
      distance: (totalDistance / 1000).toFixed(2),
      maxSpeed: maxVelocity.toFixed(1),
      time: formattedTime
    }
  }

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
                checked={visibleLaps.size === data.laps.length}
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
              {data.laps.map((lap, idx) => {
                const color = lapColors[idx % lapColors.length]
                const stats = getLapStats(lap)
                
                return (
                  <tr key={idx} className={visibleLaps.has(idx) ? 'active' : ''}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={visibleLaps.has(idx)}
                        onChange={() => onToggleLap(idx)}
                      />
                    </td>
                    <td className="col-color">
                      <span 
                        className="lap-color-box"
                        style={{ backgroundColor: color }}
                      ></span>
                    </td>
                    <td className="col-lap">Lap {idx + 1}</td>
                    <td className="col-distance">{stats.distance} km</td>
                    <td className="col-time">{stats.time}</td>
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

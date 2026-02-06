import { useState, useEffect } from 'react'
import { VBOData } from '../models/VBOData'
import { FilterIcon, FilterOffIcon } from './Icons'
import './LapsPanel.css'

interface LapsPanelProps {
  data: VBOData
  onToggleLap: (lapIdx: number) => void
  onToggleAllLaps: (show: boolean) => void
  updateCounter: number // Для принудительной перерисовки
  tolerancePercent: number
}


export function LapsPanel({ data, onToggleLap, onToggleAllLaps, updateCounter, tolerancePercent }: LapsPanelProps) {
  const [panelWidth, setPanelWidth] = useState(350)
  const [isResizing, setIsResizing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [filterOutliers, setFilterOutliers] = useState(true) // По умолчанию включен

  // Получаем отображаемые круги (после фильтрации)
  const displayedLaps = data.laps.filter(lap => !filterOutliers || !data.isOutlier(lap.index, tolerancePercent))
  
  // Проверяем выбраны ли все отображаемые круги
  const allDisplayedSelected = displayedLaps.length > 0 && displayedLaps.every(lap => lap.visible)
  
  // Находим самый быстрый круг среди видимых
  const fastestLapIndex = data.getFastestVisibleLap()
  const fastestLapTime = fastestLapIndex !== null ? data.laps[fastestLapIndex].getStats().time : null

  const handleSoloLap = (lapIndex: number) => {
    // Скрываем все круги
    onToggleAllLaps(false)
    // Показываем только выбранный
    onToggleLap(lapIndex)
  }
  
  const handleToggleAllDisplayed = (checked: boolean) => {
    // Переключаем только отображаемые круги
    displayedLaps.forEach(lap => {
      if (lap.visible !== checked) {
        onToggleLap(lap.index)
      }
    })
  }

  const toggleFilter = () => {
    setFilterOutliers(!filterOutliers)
  }

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
            <button
              className="filter-button"
              onClick={toggleFilter}
              title={filterOutliers ? "Показать все круги" : "Скрыть некорректные круги"}
            >
              {filterOutliers ? <FilterIcon size={18} /> : <FilterOffIcon size={18} />}
            </button>
            <label className="lap-checkbox-all" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={allDisplayedSelected}
                onChange={(e) => handleToggleAllDisplayed(e.target.checked)}
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
                <th className="col-solo"></th>
                <th className="col-checkbox"></th>
                <th className="col-color"></th>
                <th className="col-lap">Lap</th>
                <th className="col-distance">Distance</th>
                <th className="col-time">Time</th>
                <th className="col-speed">Max Speed</th>
              </tr>
            </thead>
            <tbody>
              {displayedLaps.map((lap) => {
                const stats = lap.getStats()
                const isFastest = lap.visible && lap.index === fastestLapIndex
                
                // Вычисляем дельту времени
                let timeDelta = null
                let timeDeltaColor = ''
                if (lap.visible && fastestLapTime !== null && stats.time > 0 && !isFastest) {
                  const deltaMs = stats.time - fastestLapTime
                  const deltaSec = deltaMs / 1000
                  timeDelta = deltaSec >= 0 ? `+${deltaSec.toFixed(3)}` : deltaSec.toFixed(3)
                  timeDeltaColor = deltaMs < 0 ? '#00ff00' : '#ff6666'
                }
                
                return (
                  <tr key={lap.index} className={lap.visible ? 'active' : ''}>
                    <td className="col-solo">
                      <button
                        className="solo-button"
                        onClick={() => handleSoloLap(lap.index)}
                        title="Solo этот круг"
                      >
                        s
                      </button>
                    </td>
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
                    <td className="col-lap">
                      {isFastest && <span style={{ marginRight: '4px' }}>🏁</span>}
                      {stats.name}
                    </td>
                    <td className="col-distance">{(stats.distance / 1000).toFixed(2)} km</td>
                    <td className="col-time">
                      <div>{stats.timeFormatted}</div>
                      {timeDelta && (
                        <div className="time-delta" style={{ color: timeDeltaColor }}>
                          {timeDelta}
                        </div>
                      )}
                    </td>
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

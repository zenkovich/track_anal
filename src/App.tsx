import { useState } from 'react'
import './App.css'
import { TrackVisualizer } from './components/TrackVisualizer'
import { LapsPanel } from './components/LapsPanel'
import { VBOData } from './models/VBOData'
import { VBOParser } from './utils/vboParser'
import { FolderIcon, MapIcon, ResetIcon, RacingFlagIcon, SettingsIcon } from './components/Icons'

function App() {
  const [vboData, setVboData] = useState<VBOData | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [showTiles, setShowTiles] = useState<boolean>(true)
  const [resetTrigger, setResetTrigger] = useState<number>(0)
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false)
  const [updateCounter, setUpdateCounter] = useState<number>(0) // Для принудительной перерисовки
  const [tolerancePercent, setTolerancePercent] = useState<number>(15) // Допустимое отклонение от медианы
  const [sortField, setSortField] = useState<'lap' | 'distance' | 'time' | 'speed' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [lapOrder, setLapOrder] = useState<number[]>([]) // Порядок индексов кругов после сортировки
  
  const handleSortChange = (field: 'lap' | 'distance' | 'time' | 'speed' | null, direction: 'asc' | 'desc') => {
    setSortField(field)
    setSortDirection(direction)
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')

    try {
      const content = await file.text()
      const parsedData = VBOParser.parse(content)
      
      if (parsedData.rows.length === 0) {
        setError('Файл не содержит данных')
        setVboData(null)
      } else {
        setVboData(parsedData)
      }
    } catch (err) {
      setError(`Ошибка при чтении файла: ${err}`)
      setVboData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenClick = () => {
    document.getElementById('file-input')?.click()
  }

  const handleToggleTiles = () => {
    setShowTiles(prev => !prev)
  }

  const handleReset = () => {
    setResetTrigger(prev => prev + 1)
  }

  const toggleAllLaps = (show: boolean) => {
    if (!vboData) return
    vboData.setAllLapsVisibility(show)
    setUpdateCounter(prev => prev + 1) // Принудительная перерисовка
  }

  const toggleLap = (lapIdx: number) => {
    if (!vboData) return
    vboData.toggleLapVisibility(lapIdx)
    setUpdateCounter(prev => prev + 1) // Принудительная перерисовка
  }


  // Извлекаем нужные метаданные
  const getCompactInfo = (data: VBOData) => {
    const metadata = data.getMetadata()
    
    return {
      model: metadata['Model'] || 'N/A',
      time: metadata['UTC Date Started'] || 'N/A',
      totalPoints: data.rows.length
    }
  }

  const compactInfo = vboData ? getCompactInfo(vboData) : null

  return (
    <div className="App">
      {/* Панель управления */}
      <header className="control-panel">
        <div className="control-panel-content">
          <div className="header-left">
            <div className="control-buttons">
              <button onClick={handleOpenClick} className="control-button-icon" title="Открыть VBO файл">
                <FolderIcon size={20} />
              </button>
              <input
                id="file-input"
                type="file"
                accept=".vbo"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {vboData && (
                <>
                  <button 
                    onClick={handleToggleTiles} 
                    className="control-button-icon" 
                    title={showTiles ? 'Скрыть карту' : 'Показать карту'}
                  >
                    <MapIcon size={20} />
                  </button>
                  <button 
                    onClick={handleReset} 
                    className="control-button-icon"
                    title="Сбросить вид"
                  >
                    <ResetIcon size={20} />
                  </button>
                  <button 
                    onClick={() => setShowSettingsPanel(prev => !prev)} 
                    className="control-button-icon"
                    title="Настройки и отладка"
                  >
                    <SettingsIcon size={20} />
                  </button>
                </>
              )}
            </div>
            <h1><RacingFlagIcon size={24} /> Track Tools</h1>
          </div>
          {compactInfo && (
            <div className="compact-info">
              <span className="info-item">
                <strong>Model:</strong> {compactInfo.model}
              </span>
              <span className="info-divider">|</span>
              <span className="info-item">
                <strong>Time:</strong> {compactInfo.time}
              </span>
              <span className="info-divider">|</span>
              <span className="info-item">
                <strong>Points:</strong> {compactInfo.totalPoints.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Основное содержимое с панелью справа */}
      <main className={vboData ? "App-main-horizontal" : "App-main"}>
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Загрузка и обработка файла...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {!vboData && !loading && !error && (
          <div className="welcome-message">
            <div className="welcome-icon" onClick={handleOpenClick} style={{ cursor: 'pointer' }}>
              <FolderIcon size={64} />
            </div>
            <h2>Track Tools</h2>
            <p>Нажмите кнопку "Открыть VBO файл" для визуализации GPS-трека</p>
            <p className="file-info">Поддерживаемый формат: VBO</p>
            <div className="features">
              <div className="feature">
                <span className="feature-icon"><MapIcon size={20} /></span>
                <span>Визуализация GPS-трека</span>
              </div>
              <div className="feature">
                <span className="feature-icon"><MapIcon size={20} /></span>
                <span>Зум и панорамирование мышкой</span>
              </div>
            </div>
          </div>
        )}

        {vboData && (
          <>
            <div className="visualization-container">
              <TrackVisualizer 
                data={vboData} 
                showTiles={showTiles}
                onToggleTiles={handleToggleTiles}
                onReset={handleReset}
                resetKey={resetTrigger}
                showSettingsPanel={showSettingsPanel}
                updateCounter={updateCounter}
                tolerancePercent={tolerancePercent}
                onToleranceChange={setTolerancePercent}
                lapOrder={lapOrder}
              />
            </div>
            <LapsPanel
              data={vboData}
              onToggleLap={toggleLap}
              onToggleAllLaps={toggleAllLaps}
              updateCounter={updateCounter}
              tolerancePercent={tolerancePercent}
              sortField={sortField}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              onLapOrderChange={setLapOrder}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App

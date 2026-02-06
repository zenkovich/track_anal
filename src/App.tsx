import { useState, useEffect } from 'react'
import './App.css'
import { TrackVisualizer } from './components/TrackVisualizer'
import { LapsPanel } from './components/LapsPanel'
import { VBOData, VBOParser } from './utils/vboParser'

function App() {
  const [vboData, setVboData] = useState<VBOData | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [showTiles, setShowTiles] = useState<boolean>(true)
  const [resetTrigger, setResetTrigger] = useState<number>(0)
  const [visibleLaps, setVisibleLaps] = useState<Set<number>>(new Set())
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false)

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

  // Инициализация видимых кругов при загрузке данных
  useEffect(() => {
    if (vboData) {
      setVisibleLaps(new Set(vboData.laps.map((_, idx) => idx)))
    }
  }, [vboData])

  const toggleAllLaps = (show: boolean) => {
    if (!vboData) return
    if (show) {
      setVisibleLaps(new Set(vboData.laps.map((_, idx) => idx)))
    } else {
      setVisibleLaps(new Set())
    }
  }

  const toggleLap = (lapIdx: number) => {
    setVisibleLaps(prev => {
      const newSet = new Set(prev)
      if (newSet.has(lapIdx)) {
        newSet.delete(lapIdx)
      } else {
        newSet.add(lapIdx)
      }
      return newSet
    })
  }


  // Извлекаем нужные метаданные
  const getCompactInfo = (data: VBOData) => {
    let model = ''
    let time = ''

    data.header.comments.forEach(comment => {
      if (comment.startsWith('Model:')) {
        model = comment.replace('Model:', '').trim()
      } else if (comment.startsWith('UTC Date Started:')) {
        time = comment.replace('UTC Date Started:', '').trim()
      }
    })

    return {
      model: model || 'N/A',
      time: time || 'N/A',
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
                📂
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
                    {showTiles ? '🗺️' : '🗺️'}
                  </button>
                  <button 
                    onClick={handleReset} 
                    className="control-button-icon"
                    title="Сбросить вид"
                  >
                    🔄
                  </button>
                  <button 
                    onClick={() => setShowDebugPanel(prev => !prev)} 
                    className="control-button-icon"
                    title="Отладка"
                  >
                    🐛
                  </button>
                </>
              )}
            </div>
            <h1>📊 VBO Track Viewer</h1>
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
            <div className="welcome-icon">📁</div>
            <h2>Добро пожаловать в VBO Track Viewer</h2>
            <p>Нажмите кнопку "Открыть VBO файл" для визуализации GPS-трека</p>
            <p className="file-info">Поддерживаемый формат: dragy VBO files</p>
            <div className="features">
              <div className="feature">
                <span className="feature-icon">🗺️</span>
                <span>Визуализация GPS-трека</span>
              </div>
              <div className="feature">
                <span className="feature-icon">🔍</span>
                <span>Зум и панорамирование мышкой</span>
              </div>
              <div className="feature">
                <span className="feature-icon">⚡</span>
                <span>Обработка больших файлов (30-50k точек)</span>
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
                visibleLaps={visibleLaps}
                showDebugPanel={showDebugPanel}
              />
            </div>
            <LapsPanel
              data={vboData}
              visibleLaps={visibleLaps}
              onToggleLap={toggleLap}
              onToggleAllLaps={toggleAllLaps}
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App

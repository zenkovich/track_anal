import { useState, useCallback } from "react";
import "./App.css";
import { TrackVisualizer } from "./components/TrackVisualizer";
import { LapsPanel } from "./components/LapsPanel";
import { ChartsPanel } from "./components/ChartsPanel";
import { VBOData } from "./models/VBOData";
import { VBOParser } from "./utils/vboParser";
import { FolderIcon, MapIcon, ResetIcon, RacingFlagIcon, SettingsIcon } from "./components/Icons";

function App() 
{
  const [vboData, setVboData] = useState<VBOData | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showTiles, setShowTiles] = useState<boolean>(true);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [updateCounter, setUpdateCounter] = useState<number>(0); // Force re-render
  const [tolerancePercent, setTolerancePercent] = useState<number>(15); // Tolerance from median for outlier filter
  const [sortField, setSortField] = useState<"lap" | "distance" | "time" | "speed" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [lapOrder, setLapOrder] = useState<number[]>([]); // Lap indices order after sorting
  const [projectionDistance, setProjectionDistance] = useState<number | null>(null); // Shared distance for synced projections

  const handleSortChange = (
    field: "lap" | "distance" | "time" | "speed" | null,
    direction: "asc" | "desc",
  ) => 
  {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleLapOrderChange = useCallback((order: number[]) => 
  {
    setLapOrder((prev) => 
    {
      if (prev.length !== order.length) return order;
      for (let i = 0; i < prev.length; i++) 
      {
        if (prev[i] !== order[i]) return order;
      }
      return prev;
    });
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => 
  {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");

    try 
    {
      const content = await file.text();
      const parsedData = VBOParser.parse(content);

      if (parsedData.rows.length === 0) 
      {
        setError("File contains no data");
        setVboData(null);
      }
      else 
      {
        setVboData(parsedData);
      }
    }
    catch (err) 
    {
      setError(`Error reading file: ${err}`);
      setVboData(null);
    }
    finally 
    {
      setLoading(false);
    }
  };

  const handleOpenClick = () => 
  {
    document.getElementById("file-input")?.click();
  };

  const handleToggleTiles = () => 
  {
    setShowTiles((prev) => !prev);
  };

  const handleReset = () => 
  {
    setResetTrigger((prev) => prev + 1);
  };

  const toggleAllLaps = (show: boolean) => 
  {
    if (!vboData) return;
    vboData.setAllLapsVisibility(show);
    setUpdateCounter((prev) => prev + 1); // Force re-render
  };

  const toggleLap = (lapIdx: number) => 
  {
    if (!vboData) return;
    vboData.toggleLapVisibility(lapIdx);
    setUpdateCounter((prev) => prev + 1); // Force re-render
  };

  // Extract metadata for display
  const getCompactInfo = (data: VBOData) => 
  {
    const metadata = data.getMetadata();

    return {
      model: metadata["Model"] || "N/A",
      time: metadata["UTC Date Started"] || "N/A",
      totalPoints: data.rows.length,
    };
  };

  const compactInfo = vboData ? getCompactInfo(vboData) : null;

  return (
    <div className="App">
      {/* Control panel */}
      <header className="control-panel">
        <div className="control-panel-content">
          <div className="header-left">
            <div className="control-buttons">
              <button
                onClick={handleOpenClick}
                className="control-button-icon"
                title="Open VBO file"
              >
                <FolderIcon size={20} />
              </button>
              <input
                id="file-input"
                type="file"
                accept=".vbo"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {vboData && (
                <>
                  <button
                    onClick={handleToggleTiles}
                    className="control-button-icon"
                    title={showTiles ? "Hide map" : "Show map"}
                  >
                    <MapIcon size={20} />
                  </button>
                  <button onClick={handleReset} className="control-button-icon" title="Reset view">
                    <ResetIcon size={20} />
                  </button>
                  <button
                    onClick={() => setShowSettingsPanel((prev) => !prev)}
                    className="control-button-icon"
                    title="Settings and debug"
                  >
                    <SettingsIcon size={20} />
                  </button>
                </>
              )}
            </div>
            <h1>
              <RacingFlagIcon size={24} /> Track Tools
            </h1>
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

      {/* Main content */}
      <main className={vboData ? "App-main-with-data" : "App-main"}>
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading and processing file...</p>
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
            <div className="welcome-icon" onClick={handleOpenClick} style={{ cursor: "pointer" }}>
              <FolderIcon size={64} />
            </div>
            <h2>Track Tools</h2>
            <p>Click "Open VBO file" to visualize GPS track</p>
            <p className="file-info">Supported format: VBO</p>
            <div className="features">
              <div className="feature">
                <span className="feature-icon">
                  <MapIcon size={20} />
                </span>
                <span>GPS track visualization</span>
              </div>
              <div className="feature">
                <span className="feature-icon">
                  <MapIcon size={20} />
                </span>
                <span>Zoom and pan with mouse</span>
              </div>
            </div>
          </div>
        )}

        {vboData && (
          <>
            <div className="track-and-laps-container">
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
                  projectionDistance={projectionDistance}
                  onProjectionDistanceChange={setProjectionDistance}
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
                onLapOrderChange={handleLapOrderChange}
              />
            </div>
            <ChartsPanel
              data={vboData}
              updateCounter={updateCounter}
              lapOrder={lapOrder}
              projectionDistance={projectionDistance}
              onProjectionDistanceChange={setProjectionDistance}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;

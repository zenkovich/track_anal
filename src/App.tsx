import { useCallback, useState, useRef } from "react";
import "./App.css";
import { ChartsPanel } from "./components/ChartsPanel";
import { FolderIcon, MapIcon, RacingFlagIcon, ResetIcon, SettingsIcon } from "./components/Icons";
import { LapsPanel } from "./components/LapsPanel";
import { TrackVisualizer } from "./components/TrackVisualizer";
import { VBOData } from "./models/VBOData";
import { Projection, ChartProjectionMode } from "./models/charts";
import { VBOParser } from "./utils/vboParser";

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
  const [sortField, setSortField] = useState<"lap" | "time" | "speed" | "s1" | "s2" | "s3" | "s4" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [lapOrder, setLapOrder] = useState<number[]>([]); // Lap indices order after sorting
  const [projection, setProjection] = useState<Projection>(null); // Shared projection (chart normalized or track distance)
  const [projectionMode, setProjectionMode] = useState<ChartProjectionMode>("normalized"); // How to project onto track when from chart
  
  const lastProjectionRef = useRef<Projection>(null);

  const handleSortChange = useCallback((
    field: "lap" | "time" | "speed" | "s1" | "s2" | "s3" | "s4" | null,
    direction: "asc" | "desc",
  ) => 
  {
    setSortField(field);
    setSortDirection(direction);
  }, []);

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

  const handleOpenClick = useCallback(() => 
  {
    document.getElementById("file-input")?.click();
  }, []);

  const handleToggleTiles = useCallback(() => 
  {
    setShowTiles((prev) => !prev);
  }, []);

  const handleReset = useCallback(() => 
  {
    setResetTrigger((prev) => prev + 1);
  }, []);

  const toggleAllLaps = useCallback((show: boolean) => 
  {
    if (!vboData) return;
    vboData.setAllLapsVisibility(show);
    setUpdateCounter((prev) => prev + 1); // Force re-render
  }, [vboData]);

  const toggleLap = useCallback((lapIdx: number) => 
  {
    if (!vboData) return;
    vboData.toggleLapVisibility(lapIdx);
    setUpdateCounter((prev) => prev + 1); // Force re-render
  }, [vboData]);

  const handleToleranceChange = useCallback((tolerance: number) => 
  {
    setTolerancePercent(tolerance);
  }, []);

  // Unified projection update handler
  // Track: apply immediately for smooth cursor following. Chart: can throttle if needed.
  const handleProjectionChange = useCallback((newProjection: Projection) => 
  {
    const prev = lastProjectionRef.current;
    const changed =
      newProjection === null && prev !== null ||
      newProjection !== null && (prev === null ||
        (prev.type !== newProjection.type) ||
        (prev.type === "chart" && newProjection.type === "chart" &&
          (Math.abs(prev.normalized - newProjection.normalized) > 0.0005 || prev.mouseX !== newProjection.mouseX)) ||
        (prev.type === "track" && newProjection.type === "track" &&
          Math.abs(prev.canonical.distance - newProjection.canonical.distance) > 1e-6));

    if (changed) 
    {
      lastProjectionRef.current = newProjection;
      setProjection(newProjection);
    }
  }, []);

  const handleProjectionModeChange = useCallback((mode: ChartProjectionMode) => 
  {
    setProjectionMode(mode);
  }, []);

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
                  onToleranceChange={handleToleranceChange}
                  lapOrder={lapOrder}
                  projection={projection}
                  projectionMode={projectionMode}
                  onProjectionChange={handleProjectionChange}
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
              projection={projection}
              projectionMode={projectionMode}
              onProjectionChange={handleProjectionChange}
              onProjectionModeChange={handleProjectionModeChange}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;

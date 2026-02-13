import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VBOData } from "../models/VBOData";
import { FilterIcon, FilterOffIcon, FilterSmallIcon, TopNIcon } from "./Icons";
import "./LapsPanel.css";

interface LapsPanelProps {
  data: VBOData;
  onToggleLap: (lapIdx: number) => void;
  onToggleAllLaps: (show: boolean) => void;
  updateCounter: number; // Force re-render
  tolerancePercent: number;
  sortField?: "lap" | "time" | "speed" | "s1" | "s2" | "s3" | "s4" | null;
  sortDirection?: "asc" | "desc";
  onSortChange?: (
    field: "lap" | "time" | "speed" | "s1" | "s2" | "s3" | "s4" | null,
    direction: "asc" | "desc"
  ) => void;
  onLapOrderChange?: (order: number[]) => void;
}

export function LapsPanel({
  data,
  onToggleLap,
  onToggleAllLaps,
  updateCounter,
  tolerancePercent,
  sortField: sortFieldProp,
  sortDirection: sortDirectionProp,
  onSortChange,
  onLapOrderChange,
}: LapsPanelProps) 
{
  const [panelWidth, setPanelWidth] = useState(544);
  const [isResizing, setIsResizing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [filterOutliers, setFilterOutliers] = useState(true); // Enabled by default

  const sortField = sortFieldProp || null;
  const sortDirection = sortDirectionProp || "asc";

  // Sort handler
  const handleSort = (field: "lap" | "time" | "speed" | "s1" | "s2" | "s3" | "s4") => 
  {
    if (sortField === field) 
    {
      // Toggle direction
      const newDirection = sortDirection === "asc" ? "desc" : "asc";
      onSortChange?.(field, newDirection);
    }
    else 
    {
      // New field - sort ascending
      onSortChange?.(field, "asc");
    }
  };

  const displayedLaps = useMemo(() => 
  {
    let laps = data.laps.filter(
      (lap) => !filterOutliers || !data.isOutlier(lap.index, tolerancePercent),
    );

    if (sortField) 
    {
      laps = [...laps].sort((a, b) => 
      {
        const statsA = a.getStats();
        const statsB = b.getStats();

        let compareValue = 0;
        switch (sortField) 
        {
          case "lap":
            compareValue = a.index - b.index;
            break;
          case "time":
            compareValue = statsA.time - statsB.time;
            break;
          case "speed":
            compareValue = statsA.maxSpeed - statsB.maxSpeed;
            break;
          case "s1":
          case "s2":
          case "s3":
          case "s4":
            {
              const sectorIdx = parseInt(sortField[1], 10) - 1;
              const sectorA = a.getSectorData().find((s) => s.sectorIndex === sectorIdx);
              const sectorB = b.getSectorData().find((s) => s.sectorIndex === sectorIdx);
              const timeA = sectorA?.timeMs ?? 0;
              const timeB = sectorB?.timeMs ?? 0;
              compareValue = timeA - timeB;
            }
            break;
        }

        return sortDirection === "asc" ? compareValue : -compareValue;
      });
    }

    return laps;
  }, [data, updateCounter, filterOutliers, tolerancePercent, sortField, sortDirection]);

  // Check if all displayed laps are selected
  const allDisplayedSelected =
    displayedLaps.length > 0 && displayedLaps.every((lap) => lap.visible);

  // Find fastest lap among visible
  const fastestLapIndex = data.getFastestVisibleLap();
  const fastestLapTime =
    fastestLapIndex !== null ? data.laps[fastestLapIndex].getStats().time : null;
  const fastestLapSectorTimes =
    fastestLapIndex !== null
      ? data.laps[fastestLapIndex].getSectorData().map((s) => s.timeMs)
      : null;

  const hasSectors = data.trackData && data.trackData.sectors.length > 0;

  const handleSoloLap = useCallback((lapIndex: number) => 
  {
    // Hide all laps
    onToggleAllLaps(false);
    // Show only selected
    onToggleLap(lapIndex);
  }, [onToggleAllLaps, onToggleLap]);

  const handleToggleAllDisplayed = useCallback((checked: boolean) => 
  {
    // Toggle only displayed laps
    displayedLaps.forEach((lap) => 
    {
      if (lap.visible !== checked) 
      {
        onToggleLap(lap.index);
      }
    });
  }, [displayedLaps, onToggleLap]);

  const toggleFilter = useCallback(() => 
  {
    setFilterOutliers((prev) => !prev);
  }, []);

  const selectTopN = useCallback((n: number) => 
  {
    // First enable sort by time (ascending)
    onSortChange?.("time", "asc");

    // Wait for sort to apply, then select only top N fastest
    setTimeout(() => 
    {
      // Show all laps first
      onToggleAllLaps(true);

      // Then hide all except top N
      const allLaps = data.laps.filter(
        (lap) => !filterOutliers || !data.isOutlier(lap.index, tolerancePercent),
      );

      // Sort by time
      const sortedByTime = [...allLaps].sort((a, b) => 
      {
        const timeA = a.getStats().time;
        const timeB = b.getStats().time;
        return timeA - timeB;
      });

      // Take top N
      const topN = sortedByTime.slice(0, n);
      const topNIndices = new Set(topN.map((lap) => lap.index));

      // Hide all except top N
      data.laps.forEach((lap) => 
      {
        if (lap.visible && !topNIndices.has(lap.index)) 
        {
          onToggleLap(lap.index);
        }
        else if (!lap.visible && topNIndices.has(lap.index)) 
        {
          onToggleLap(lap.index);
        }
      });
    }, 50);
  }, [data, filterOutliers, tolerancePercent, onSortChange, onToggleAllLaps, onToggleLap]);

  // Update lap order when sort or filters change
  const lastOrderRef = useRef<string | null>(null);
  const onLapOrderChangeRef = useRef(onLapOrderChange);
  
  useEffect(() => 
  {
    onLapOrderChangeRef.current = onLapOrderChange;
  }, [onLapOrderChange]);

  useEffect(() => 
  {
    if (!onLapOrderChangeRef.current) return;
    const order = displayedLaps.map((lap) => lap.index);
    const orderKey = order.join(",");
    if (orderKey === lastOrderRef.current) return;
    lastOrderRef.current = orderKey;
    onLapOrderChangeRef.current(order);
  }, [displayedLaps]);

  // Force re-render when updateCounter changes
  useEffect(() => 
  {
    // Just trigger re-render
  }, [updateCounter]);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => 
  {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => 
  {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => 
    {
      const newWidth = Math.min(
        Math.max(window.innerWidth - e.clientX, 250),
        window.innerWidth * 0.5,
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => 
    {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => 
    {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (data.laps.length <= 1) return null;

  return (
    <div
      className={`laps-panel-side ${collapsed ? "collapsed" : ""}`}
      style={{ width: collapsed ? "40px" : `${panelWidth}px` }}
    >
      {!collapsed && (
        <div className="laps-resizer-side" onMouseDown={handleResizerMouseDown}>
          <div className="laps-resizer-handle-side"></div>
        </div>
      )}

      <div className="laps-panel-header-side">
        <button
          className="collapse-button-side"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "◀" : "▶"}
        </button>
        {!collapsed && (
          <>
            <h3>🏁 Laps ({data.laps.length})</h3>
            <div className="header-buttons">
              <button
                className="filter-button"
                onClick={toggleFilter}
                title={filterOutliers ? "Show all laps" : "Hide outlier laps"}
              >
                {filterOutliers ? <FilterIcon size={18} /> : <FilterOffIcon size={18} />}
              </button>
              <button
                className="filter-button"
                onClick={() => selectTopN(2)}
                title="Top 2 fastest laps"
              >
                <TopNIcon size={18} number={2} />
              </button>
              <button
                className="filter-button"
                onClick={() => selectTopN(3)}
                title="Top 3 fastest laps"
              >
                <TopNIcon size={18} number={3} />
              </button>
              <button
                className="filter-button"
                onClick={() => selectTopN(4)}
                title="Top 4 fastest laps"
              >
                <TopNIcon size={18} number={4} />
              </button>
              <button
                className="filter-button"
                onClick={() => selectTopN(5)}
                title="Top 5 fastest laps"
              >
                <TopNIcon size={18} number={5} />
              </button>
            </div>
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
                <th className="col-lap sortable" onClick={() => handleSort("lap")}>
                  Lap {sortField === "lap" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
                <th className="col-time sortable" onClick={() => handleSort("time")}>
                  Time {sortField === "time" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
                {hasSectors &&
                  [1, 2, 3, 4].map((s) => (
                    <th
                      key={s}
                      className="col-sector sortable"
                      onClick={() => handleSort(`s${s}` as "s1" | "s2" | "s3" | "s4")}
                    >
                      S{s} {sortField === `s${s}` && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                  ))}
                <th className="col-speed sortable" onClick={() => handleSort("speed")}>
                  Max Speed {sortField === "speed" && (sortDirection === "asc" ? "▲" : "▼")}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedLaps.map((lap) => 
              {
                const stats = lap.getStats();
                const isFastest = lap.visible && lap.index === fastestLapIndex;
                const isFiltered = data.isOutlier(lap.index, tolerancePercent);

                // Compute time delta
                let timeDelta = null;
                let timeDeltaColor = "";
                if (lap.visible && fastestLapTime !== null && stats.time > 0 && !isFastest) 
                {
                  const deltaMs = stats.time - fastestLapTime;
                  const deltaSec = deltaMs / 1000;
                  timeDelta = deltaSec >= 0 ? `+${deltaSec.toFixed(3)}` : deltaSec.toFixed(3);
                  timeDeltaColor = deltaMs < 0 ? "#00ff00" : "#ff6666";
                }

                const sectorData = lap.getSectorData();
                const sectorSumMs = sectorData.reduce((sum, s) => sum + s.timeMs, 0);
                const lapTimeMs = stats.time;
                const timeDiffMs = Math.abs(sectorSumMs - lapTimeMs);
                const sectorTimeValid = timeDiffMs <= 10;

                return (
                  <tr key={lap.index} className={lap.visible ? "active" : ""}>
                    <td className="col-solo">
                      <button
                        className="solo-button"
                        onClick={() => handleSoloLap(lap.index)}
                        title="Solo this lap"
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
                      <span className="lap-color-box" style={{ backgroundColor: lap.color }}></span>
                    </td>
                    <td className="col-lap">
                      {isFastest && <span style={{ marginRight: "4px" }}>🏁</span>}
                      {isFiltered && !filterOutliers && (
                        <span style={{ marginRight: "4px", opacity: 0.5 }}>
                          <FilterSmallIcon size={12} />
                        </span>
                      )}
                      {stats.name}
                    </td>
                    <td className="col-time">
                      <div>
                        {stats.timeFormatted}
                        {!sectorTimeValid && hasSectors && (
                          <span
                            title={`Sector sum differs from lap time by ${(timeDiffMs / 1000).toFixed(3)}s`}
                            style={{ color: "#ff6666", marginLeft: 4 }}
                          >
                            ⚠
                          </span>
                        )}
                      </div>
                      {timeDelta && (
                        <div className="time-delta" style={{ color: timeDeltaColor }}>
                          {timeDelta}
                        </div>
                      )}
                    </td>
                    {hasSectors &&
                      [0, 1, 2, 3].map((sectorIdx) => 
                      {
                        const sector = sectorData.find((sd) => sd.sectorIndex === sectorIdx);
                        const sectorTimeMs = sector?.timeMs ?? 0;
                        const refTime = fastestLapSectorTimes?.[sectorIdx];
                        let sectorDelta = null;
                        let sectorDeltaColor = "";
                        if (
                          lap.visible &&
                          refTime !== undefined &&
                          sectorTimeMs > 0 &&
                          !(isFastest && sectorIdx === 0)
                        ) 
                        {
                          const deltaMs = sectorTimeMs - refTime;
                          const deltaSec = deltaMs / 1000;
                          sectorDelta =
                            deltaSec >= 0 ? `+${deltaSec.toFixed(3)}` : deltaSec.toFixed(3);
                          sectorDeltaColor = deltaMs < 0 ? "#00ff00" : "#ff6666";
                        }
                        const sectorFormatted = sectorTimeMs > 0
                          ? `${(sectorTimeMs / 1000).toFixed(3)}`
                          : "-";

                        return (
                          <td key={sectorIdx} className="col-sector">
                            <div>{sectorFormatted}</div>
                            {sectorDelta && (
                              <div className="time-delta" style={{ color: sectorDeltaColor }}>
                                {sectorDelta}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    <td className="col-speed">{stats.maxSpeed} km/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Activity,
  Layers,
  Sparkles,
  RefreshCw,
  Info,
  Sliders,
  Check,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { API_BASE } from '../../config/api';

interface ScatterPoint {
  x: number;
  y: number;
  time?: string;
  location?: string;
}

interface RegressionData {
  slope: number;
  intercept: number;
  r_squared: number;
  x_min: number;
  x_max: number;
  y_at_xmin: number;
  y_at_xmax: number;
}

interface ScatterData {
  x_var: string;
  y_var: string;
  sample_count: number;
  displayed_points: number;
  pearson: number | null;
  spearman: number | null;
  regression: RegressionData | null;
  points: ScatterPoint[];
}

interface ScatterPlotProps {
  availableVariables: string[];
  initialX?: string;
  initialY?: string;
  datasetColumnMap?: Record<string, string>;
}

export default function ScatterPlot({
  availableVariables,
  initialX,
  initialY,
  datasetColumnMap,
}: ScatterPlotProps) {
  const [xVar, setXVar] = useState<string>(initialX || availableVariables[0] || '');
  const [yVar, setYVar] = useState<string>(initialY || availableVariables[1] || availableVariables[0] || '');
  const [showRegression, setShowRegression] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScatterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ pt: ScatterPoint; screenX: number; screenY: number } | null>(null);

  // SVG dimensions
  const svgWidth = 720;
  const svgHeight = 420;
  const margin = { top: 30, right: 30, bottom: 50, left: 60 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  useEffect(() => {
    if (!xVar || !yVar) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show loading when the selected variables change.
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/visualize/scatter?x_var=${encodeURIComponent(xVar)}&y_var=${encodeURIComponent(yVar)}&max_points=1000`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.message || 'Failed to load scatter plot data.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError('Error connecting to backend visualization API.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [xVar, yVar]);

  // Compute Scales
  const scales = useMemo(() => {
    if (!data || !data.points || data.points.length === 0) return null;

    const xVals = data.points.map((p) => p.x);
    const yVals = data.points.map((p) => p.y);

    let minX = Math.min(...xVals);
    let maxX = Math.max(...xVals);
    let minY = Math.min(...yVals);
    let maxY = Math.max(...yVals);

    // Add 5% padding
    const padX = (maxX - minX) * 0.05 || 1;
    const padY = (maxY - minY) * 0.05 || 1;
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;

    const scaleX = (val: number) => margin.left + ((val - minX) / (maxX - minX)) * innerWidth;
    const scaleY = (val: number) => margin.top + innerHeight - ((val - minY) / (maxY - minY)) * innerHeight;

    // Generate 5 grid ticks
    const xTicks = Array.from({ length: 6 }).map((_, i) => minX + (i * (maxX - minX)) / 5);
    const yTicks = Array.from({ length: 5 }).map((_, i) => minY + (i * (maxY - minY)) / 4);

    return { scaleX, scaleY, minX, maxX, minY, maxY, xTicks, yTicks };
  }, [data, innerWidth, innerHeight, margin]);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl text-slate-100">
      {/* Header and Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60 font-mono">
              Bivariate Scatter Analysis
            </span>
            {data && data.sample_count > 0 && (
              <span className="text-[10px] text-slate-400 font-mono">
                {data.sample_count.toLocaleString()} samples
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            <span className="text-cyan-300 font-mono">{xVar}</span>
            <span className="text-slate-500 font-sans mx-2">vs</span>
            <span className="text-teal-300 font-mono">{yVar}</span>
          </h3>
        </div>

        {/* Variable Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">X:</span>
            <select
              value={xVar}
              onChange={(e) => setXVar(e.target.value)}
              className="bg-transparent text-cyan-300 font-mono font-medium focus:outline-none cursor-pointer"
            >
              {availableVariables.map((v) => (
                <option key={v} value={v} className="bg-slate-900 text-white">
                  {v} {datasetColumnMap?.[v] ? `(${datasetColumnMap[v]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Y:</span>
            <select
              value={yVar}
              onChange={(e) => setYVar(e.target.value)}
              className="bg-transparent text-teal-300 font-mono font-medium focus:outline-none cursor-pointer"
            >
              {availableVariables.map((v) => (
                <option key={v} value={v} className="bg-slate-900 text-white">
                  {v} {datasetColumnMap?.[v] ? `(${datasetColumnMap[v]})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Regression Line Toggle */}
          <button
            onClick={() => setShowRegression(!showRegression)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center space-x-1.5 ${
              showRegression
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Trend Line</span>
          </button>
        </div>
      </div>

      {/* Statistical Summary Strip */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono text-xs">
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Pearson (r)</p>
            <p className="text-sm font-bold text-cyan-300">
              {data.pearson !== null ? data.pearson : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Spearman (ρ)</p>
            <p className="text-sm font-bold text-teal-300">
              {data.spearman !== null ? data.spearman : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">R² Variance</p>
            <p className="text-sm font-bold text-indigo-300">
              {data.regression?.r_squared !== undefined ? data.regression.r_squared : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Pairs Plotted</p>
            <p className="text-sm font-bold text-white">
              {data.displayed_points.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div className="relative w-full overflow-hidden bg-slate-950 rounded-xl border border-slate-800/80 p-2">
        {loading ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <p className="text-xs text-slate-400 font-mono">Plotting scatter distribution...</p>
          </div>
        ) : error ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-2 text-rose-400 text-xs">
            <Info className="w-5 h-5" />
            <p>{error}</p>
          </div>
        ) : !data || data.points.length === 0 ? (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-2 text-slate-500 text-xs">
            <Info className="w-5 h-5" />
            <p>No valid pairwise non-null observations found for {xVar} and {yVar}.</p>
          </div>
        ) : scales ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto select-none"
            >
              {/* Grid Lines */}
              {scales.xTicks.map((tick, i) => {
                const x = scales.scaleX(tick);
                return (
                  <g key={`x-grid-${i}`}>
                    <line
                      x1={x}
                      y1={margin.top}
                      x2={x}
                      y2={margin.top + innerHeight}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={x}
                      y={margin.top + innerHeight + 18}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {tick.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {scales.yTicks.map((tick, i) => {
                const y = scales.scaleY(tick);
                return (
                  <g key={`y-grid-${i}`}>
                    <line
                      x1={margin.left}
                      y1={y}
                      x2={margin.left + innerWidth}
                      y2={y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={margin.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {tick.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Axis Labels */}
              <text
                x={margin.left + innerWidth / 2}
                y={svgHeight - 10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {xVar}
              </text>
              <text
                x={-(margin.top + innerHeight / 2)}
                y={18}
                transform="rotate(-90)"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {yVar}
              </text>

              {/* Regression Trend Line */}
              {showRegression && data.regression && (
                <line
                  x1={scales.scaleX(data.regression.x_min)}
                  y1={scales.scaleY(data.regression.y_at_xmin)}
                  x2={scales.scaleX(data.regression.x_max)}
                  y2={scales.scaleY(data.regression.y_at_xmax)}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  className="drop-shadow"
                />
              )}

              {/* Scatter Points */}
              {data.points.map((pt, i) => {
                const cx = scales.scaleX(pt.x);
                const cy = scales.scaleY(pt.y);
                const isHovered = hoveredPoint?.pt === pt;

                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6 : 3.5}
                    fill={isHovered ? '#ffffff' : '#06b6d4'}
                    fillOpacity={isHovered ? 1 : 0.65}
                    stroke={isHovered ? '#06b6d4' : '#0891b2'}
                    strokeWidth={isHovered ? 2 : 1}
                    className="cursor-pointer transition-all duration-75"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredPoint({ pt, screenX: rect.left, screenY: rect.top });
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })}
            </svg>

            {/* Interactive Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute z-30 pointer-events-none p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-2xl backdrop-blur-md text-xs space-y-1 font-mono transform -translate-x-1/2 -translate-y-full mb-3"
                style={{
                  left: `${scales.scaleX(hoveredPoint.pt.x)}px`,
                  top: `${scales.scaleY(hoveredPoint.pt.y) - 10}px`,
                }}
              >
                <div className="text-white font-bold pb-1 border-b border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-cyan-300">{xVar}: {hoveredPoint.pt.x}</span>
                  <span className="text-teal-300">{yVar}: {hoveredPoint.pt.y}</span>
                </div>
                {hoveredPoint.pt.time && (
                  <p className="text-[10px] text-slate-400">Time: {hoveredPoint.pt.time}</p>
                )}
                {hoveredPoint.pt.location && (
                  <p className="text-[10px] text-purple-400">Location: {hoveredPoint.pt.location}</p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Regression Formula Footnote */}
      {data?.regression && showRegression && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
          <span>
            Linear Model: <strong className="text-cyan-300">y = {data.regression.slope}x + {data.regression.intercept}</strong>
          </span>
          <span>R² = {data.regression.r_squared}</span>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Sliders,
  RefreshCw,
  Info,
  Layers,
  HelpCircle,
  TrendingUp,
  Percent,
  AlertCircle
} from 'lucide-react';
import { API_BASE } from '../../config/api';

interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
  percentage: number;
  label: string;
}

interface DistributionStats {
  total_count: number;
  valid_count: number;
  null_count: number;
  null_pct: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  q25: number | null;
  q75: number | null;
  iqr: number | null;
  outlier_count: number;
}

interface BoxPlotData {
  min: number | null;
  lower_whisker: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  upper_whisker: number | null;
  max: number | null;
  outlier_count: number;
}

interface DistributionResponse {
  variable: string;
  stats: DistributionStats;
  histogram: HistogramBin[];
  box_plot: BoxPlotData;
}

interface DistributionChartProps {
  availableVariables: string[];
  initialVariable?: string;
  datasetColumnMap?: Record<string, string>;
}

export default function DistributionChart({
  availableVariables,
  initialVariable,
  datasetColumnMap,
}: DistributionChartProps) {
  const [variable, setVariable] = useState<string>(initialVariable || availableVariables[0] || '');
  const [bins, setBins] = useState<number>(20);
  const [viewMode, setViewMode] = useState<'histogram' | 'boxplot'>('histogram');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DistributionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBin, setHoveredBin] = useState<HistogramBin | null>(null);

  // SVG dimensions
  const svgWidth = 760;
  const svgHeight = 380;
  const margin = { top: 30, right: 30, bottom: 50, left: 60 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  useEffect(() => {
    if (!variable) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show loading when the selected variable changes.
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/visualize/distribution?variable=${encodeURIComponent(variable)}&bins=${bins}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.message || 'Failed to load distribution data.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError('Error connecting to backend distribution API.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [variable, bins]);

  // Compute Scales for Histogram
  const histogramScales = useMemo(() => {
    if (!data || !data.histogram || data.histogram.length === 0) return null;

    const maxCount = Math.max(...data.histogram.map((b) => b.count), 1);
    const n = data.histogram.length;
    const barWidth = innerWidth / n;

    const scaleY = (count: number) => margin.top + innerHeight - (count / maxCount) * innerHeight;
    const yTicks = Array.from({ length: 5 }).map((_, i) => Math.round((i * maxCount) / 4));

    return { maxCount, barWidth, scaleY, yTicks };
  }, [data, innerWidth, innerHeight, margin]);

  // Compute Scales for Box Plot
  const boxPlotScales = useMemo(() => {
    if (!data || !data.box_plot || data.box_plot.min === null || data.box_plot.max === null) {
      return null;
    }

    const { min, max } = data.box_plot;
    const pad = (max - min) * 0.1 || 1;
    const minX = min - pad;
    const maxX = max + pad;

    const scaleX = (val: number) => margin.left + ((val - minX) / (maxX - minX)) * innerWidth;
    const xTicks = Array.from({ length: 6 }).map((_, i) => minX + (i * (maxX - minX)) / 5);

    return { scaleX, minX, maxX, xTicks };
  }, [data, innerWidth, margin]);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl text-slate-100">
      {/* Header and Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800/60 font-mono">
              Univariate Distribution
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {data ? `${data.stats.valid_count.toLocaleString()} valid observations` : ''}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1 font-mono text-cyan-300">
            {variable}
          </h3>
        </div>

        {/* View mode toggle and Variable Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Variable Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Var:</span>
            <select
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              className="bg-transparent text-cyan-300 font-mono font-medium focus:outline-none cursor-pointer"
            >
              {availableVariables.map((v) => (
                <option key={v} value={v} className="bg-slate-900 text-white">
                  {v} {datasetColumnMap?.[v] ? `(${datasetColumnMap[v]})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Histogram Bins Selector */}
          {viewMode === 'histogram' && (
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400">Bins:</span>
              <input
                type="range"
                min="10"
                max="40"
                step="5"
                value={bins}
                onChange={(e) => setBins(Number(e.target.value))}
                className="w-16 accent-cyan-500 cursor-pointer"
              />
              <span className="font-mono text-cyan-300">{bins}</span>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('histogram')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'histogram'
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Histogram
            </button>
            <button
              onClick={() => setViewMode('boxplot')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'boxplot'
                  ? 'bg-slate-800 text-teal-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Box Plot
            </button>
          </div>
        </div>
      </div>

      {/* Summary Statistics Strip */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono text-xs">
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Mean</p>
            <p className="text-sm font-bold text-cyan-300">{data.stats.mean ?? 'N/A'}</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Median</p>
            <p className="text-sm font-bold text-teal-300">{data.stats.median ?? 'N/A'}</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Std Dev</p>
            <p className="text-sm font-bold text-indigo-300">{data.stats.std ?? 'N/A'}</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">IQR</p>
            <p className="text-sm font-bold text-emerald-400">{data.stats.iqr ?? 'N/A'}</p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Min / Max</p>
            <p className="text-xs font-bold text-slate-300">
              {data.stats.min} – {data.stats.max}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Outliers</p>
            <p className="text-sm font-bold text-rose-400">{data.stats.outlier_count}</p>
          </div>
        </div>
      )}

      {/* Visualization Canvas */}
      <div className="relative w-full overflow-hidden bg-slate-950 rounded-xl border border-slate-800/80 p-2">
        {loading ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <p className="text-xs text-slate-400 font-mono">Computing distribution metrics...</p>
          </div>
        ) : error ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-2 text-rose-400 text-xs">
            <Info className="w-5 h-5" />
            <p>{error}</p>
          </div>
        ) : !data || data.stats.valid_count === 0 ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-2 text-slate-500 text-xs">
            <Info className="w-5 h-5" />
            <p>No valid numerical values found for variable {variable}.</p>
          </div>
        ) : viewMode === 'histogram' && histogramScales ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto select-none"
              onMouseLeave={() => setHoveredBin(null)}
            >
              {/* Y Grid */}
              {histogramScales.yTicks.map((tick, i) => {
                const y = histogramScales.scaleY(tick);
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
                      {tick}
                    </text>
                  </g>
                );
              })}

              {/* Histogram Bars */}
              {data.histogram.map((bin, i) => {
                const x = margin.left + i * histogramScales.barWidth;
                const y = histogramScales.scaleY(bin.count);
                const barH = margin.top + innerHeight - y;
                const isHovered = hoveredBin === bin;

                return (
                  <g key={`bar-${i}`}>
                    <rect
                      x={x + 1}
                      y={y}
                      width={Math.max(1, histogramScales.barWidth - 2)}
                      height={Math.max(0, barH)}
                      fill={isHovered ? '#38bdf8' : '#0ea5e9'}
                      fillOpacity={isHovered ? 1 : 0.75}
                      rx="3"
                      className="cursor-pointer transition-all duration-75"
                      onMouseEnter={() => setHoveredBin(bin)}
                    />
                    {/* Tick label at every 3rd or 4th bin */}
                    {i % Math.ceil(data.histogram.length / 6) === 0 && (
                      <text
                        x={x + histogramScales.barWidth / 2}
                        y={margin.top + innerHeight + 16}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {bin.bin_start}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Axis Label */}
              <text
                x={margin.left + innerWidth / 2}
                y={svgHeight - 10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {variable} (Value Bins)
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
                Frequency Count
              </text>
            </svg>

            {/* Hover Tooltip for Histogram */}
            {hoveredBin && (
              <div
                className="absolute z-30 pointer-events-none p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-2xl backdrop-blur-md text-xs space-y-1 font-mono top-4 right-4"
              >
                <p className="text-white font-bold">{hoveredBin.label}</p>
                <p className="text-cyan-300 font-bold text-sm">
                  Count: {hoveredBin.count.toLocaleString()}
                </p>
                <p className="text-slate-400 text-[10px]">
                  Share: {hoveredBin.percentage}% of valid samples
                </p>
              </div>
            )}
          </div>
        ) : viewMode === 'boxplot' && boxPlotScales && data.box_plot.min !== null ? (
          <div className="relative">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto select-none">
              {/* X Grid Lines */}
              {boxPlotScales.xTicks.map((tick, i) => {
                const x = boxPlotScales.scaleX(tick);
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

              {/* Box Plot Elements */}
              {(() => {
                const bp = data.box_plot;
                const centerY = margin.top + innerHeight / 2;
                const boxHeight = 90;

                const xMin = boxPlotScales.scaleX(bp.min!);
                const xLowWhisk = boxPlotScales.scaleX(bp.lower_whisker!);
                const xQ25 = boxPlotScales.scaleX(bp.q25!);
                const xMed = boxPlotScales.scaleX(bp.median!);
                const xQ75 = boxPlotScales.scaleX(bp.q75!);
                const xUpWhisk = boxPlotScales.scaleX(bp.upper_whisker!);
                const xMax = boxPlotScales.scaleX(bp.max!);

                return (
                  <g>
                    {/* Lower Whisker Line */}
                    <line
                      x1={xLowWhisk}
                      y1={centerY}
                      x2={xQ25}
                      y2={centerY}
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                    {/* Lower Whisker Cap */}
                    <line
                      x1={xLowWhisk}
                      y1={centerY - 20}
                      x2={xLowWhisk}
                      y2={centerY + 20}
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />

                    {/* Upper Whisker Line */}
                    <line
                      x1={xQ75}
                      y1={centerY}
                      x2={xUpWhisk}
                      y2={centerY}
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                    {/* Upper Whisker Cap */}
                    <line
                      x1={xUpWhisk}
                      y1={centerY - 20}
                      x2={xUpWhisk}
                      y2={centerY + 20}
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />

                    {/* IQR Box (Q25 to Q75) */}
                    <rect
                      x={xQ25}
                      y={centerY - boxHeight / 2}
                      width={Math.max(1, xQ75 - xQ25)}
                      height={boxHeight}
                      fill="#0e7490"
                      fillOpacity={0.4}
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      rx="6"
                    />

                    {/* Median Line */}
                    <line
                      x1={xMed}
                      y1={centerY - boxHeight / 2}
                      x2={xMed}
                      y2={centerY + boxHeight / 2}
                      stroke="#38bdf8"
                      strokeWidth="3.5"
                    />

                    {/* Outlier markers if min/max exceed whiskers */}
                    {bp.min! < bp.lower_whisker! && (
                      <circle cx={xMin} cy={centerY} r="4" fill="#f43f5e" />
                    )}
                    {bp.max! > bp.upper_whisker! && (
                      <circle cx={xMax} cy={centerY} r="4" fill="#f43f5e" />
                    )}

                    {/* Labels */}
                    <text
                      x={xMed}
                      y={centerY - boxHeight / 2 - 10}
                      textAnchor="middle"
                      fill="#38bdf8"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      Median: {bp.median}
                    </text>
                    <text
                      x={xQ25}
                      y={centerY + boxHeight / 2 + 18}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      Q1: {bp.q25}
                    </text>
                    <text
                      x={xQ75}
                      y={centerY + boxHeight / 2 + 18}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      Q3: {bp.q75}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  );
}

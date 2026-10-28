'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  Activity,
  Layers,
  RefreshCw,
  Info,
  Sliders,
  Filter,
  AlertTriangle
} from 'lucide-react';
import { API_BASE } from '../../config/api';

interface TimeSeriesPoint {
  time: string;
  value: number | null;
  min?: number | null;
  max?: number | null;
  count: number;
}

interface TimeSeriesResponse {
  variable: string;
  aggregation: string;
  location: string | null;
  total_points: number;
  summary: {
    min: number | null;
    max: number | null;
    avg: number | null;
    valid_count: number;
    gap_count: number;
  };
  series: TimeSeriesPoint[];
}

interface TimeSeriesChartProps {
  availableVariables: string[];
  initialVariable?: string;
  availableLocations?: string[];
  datasetColumnMap?: Record<string, string>;
  defaultTimeRange?: { start: string; end: string } | null;
}

export default function TimeSeriesChart({
  availableVariables,
  initialVariable,
  availableLocations = [],
  datasetColumnMap,
  defaultTimeRange,
}: TimeSeriesChartProps) {
  const [variable, setVariable] = useState<string>(initialVariable || availableVariables[0] || '');
  const [location, setLocation] = useState<string>('all');
  const [aggregation, setAggregation] = useState<string>('1d');
  const [startDate, setStartDate] = useState<string>(
    defaultTimeRange?.start ? defaultTimeRange.start.split(' ')[0] : ''
  );
  const [endDate, setEndDate] = useState<string>(
    defaultTimeRange?.end ? defaultTimeRange.end.split(' ')[0] : ''
  );

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TimeSeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 400;
  const margin = { top: 30, right: 30, bottom: 50, left: 65 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  useEffect(() => {
    if (!variable) return;

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show loading when the selected series changes.
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      variable,
      aggregation,
      max_points: '1200',
    });
    if (location && location !== 'all') {
      params.append('location', location);
    }
    if (startDate) {
      params.append('start_date', startDate);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }

    fetch(`${API_BASE}/api/visualize/timeseries?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.message || 'Failed to load time series data.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError('Error connecting to backend time series API.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [variable, location, aggregation, startDate, endDate]);

  // Compute Scales and SVG Path Segments (Breaking lines on nulls to preserve missing gaps)
  const { pathSegments, scales, xLabels, yTicks } = useMemo(() => {
    if (!data || !data.series || data.series.length === 0) {
      return { pathSegments: [], scales: null, xLabels: [], yTicks: [] };
    }

    const validVals = data.series
      .map((p) => p.value)
      .filter((v): v is number => v !== null && !isNaN(v));

    if (validVals.length === 0) {
      return { pathSegments: [], scales: null, xLabels: [], yTicks: [] };
    }

    let minY = Math.min(...validVals);
    let maxY = Math.max(...validVals);
    const padY = (maxY - minY) * 0.1 || 1;
    minY -= padY;
    maxY += padY;

    const n = data.series.length;
    const scaleX = (index: number) => margin.left + (index / Math.max(1, n - 1)) * innerWidth;
    const scaleY = (val: number) => margin.top + innerHeight - ((val - minY) / (maxY - minY)) * innerHeight;

    // Build segments broken on null gaps
    const segments: string[] = [];
    let currentSegment: string[] = [];

    data.series.forEach((pt, i) => {
      if (pt.value !== null && !isNaN(pt.value)) {
        const x = scaleX(i);
        const y = scaleY(pt.value);
        if (currentSegment.length === 0) {
          currentSegment.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
        } else {
          currentSegment.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
      } else {
        if (currentSegment.length > 0) {
          segments.push(currentSegment.join(' '));
          currentSegment = [];
        }
      }
    });

    if (currentSegment.length > 0) {
      segments.push(currentSegment.join(' '));
    }

    // X-axis label ticks (5-6 intervals)
    const labelStep = Math.max(1, Math.floor(n / 6));
    const labels: { text: string; x: number }[] = [];
    for (let i = 0; i < n; i += labelStep) {
      labels.push({
        text: data.series[i].time.split(' ')[0],
        x: scaleX(i),
      });
    }

    // Y-axis ticks
    const ticksY = Array.from({ length: 5 }).map((_, i) => minY + (i * (maxY - minY)) / 4);

    return {
      pathSegments: segments,
      scales: { scaleX, scaleY, minY, maxY },
      xLabels: labels,
      yTicks: ticksY,
    };
  }, [data, innerWidth, innerHeight, margin]);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl text-slate-100">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800/60 font-mono">
              Chronological Time-Series
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Axis: Standardized_Time ({aggregation})
            </span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1 flex items-center space-x-2 font-mono">
            <span className="text-cyan-300">{variable}</span>
            {location !== 'all' && (
              <span className="text-purple-300 text-xs font-sans px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800/80">
                {location}
              </span>
            )}
          </h3>
        </div>

        {/* Filter Controls Ribbon */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Variable Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
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

          {/* Aggregation Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value="raw" className="bg-slate-900">Raw Samples</option>
              <option value="1h" className="bg-slate-900">1 Hour Mean</option>
              <option value="6h" className="bg-slate-900">6 Hours Mean</option>
              <option value="1d" className="bg-slate-900">Daily Average</option>
              <option value="7d" className="bg-slate-900">Weekly Average</option>
              <option value="1M" className="bg-slate-900">Monthly Average</option>
            </select>
          </div>

          {/* Location Filter if Available */}
          {availableLocations.length > 0 && (
            <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <MapPin className="w-3.5 h-3.5 text-purple-400" />
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-transparent text-purple-300 font-medium focus:outline-none cursor-pointer capitalize"
              >
                <option value="all" className="bg-slate-900">All Locations</option>
                {availableLocations.map((loc) => (
                  <option key={loc} value={loc} className="bg-slate-900 capitalize">
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range Inputs */}
          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-[11px]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none font-mono cursor-pointer"
            />
            <span className="text-slate-500">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none font-mono cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono text-xs">
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Average</p>
            <p className="text-sm font-bold text-cyan-300">
              {data.summary.avg !== null ? data.summary.avg : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Min</p>
            <p className="text-sm font-bold text-teal-300">
              {data.summary.min !== null ? data.summary.min : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Max</p>
            <p className="text-sm font-bold text-indigo-300">
              {data.summary.max !== null ? data.summary.max : 'N/A'}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
            <p className="text-[10px] text-slate-400 uppercase">Valid Buckets</p>
            <p className="text-sm font-bold text-emerald-400">
              {data.summary.valid_count.toLocaleString()}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60 col-span-2 sm:col-span-1">
            <p className="text-[10px] text-slate-400 uppercase">Missing Gaps</p>
            <p className="text-sm font-bold text-amber-400">
              {data.summary.gap_count.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* SVG Time Series Line Chart */}
      <div className="relative w-full overflow-hidden bg-slate-950 rounded-xl border border-slate-800/80 p-2">
        {loading ? (
          <div className="h-[380px] flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
            <p className="text-xs text-slate-400 font-mono">Aggregating time-series timeline...</p>
          </div>
        ) : error ? (
          <div className="h-[380px] flex flex-col items-center justify-center space-y-2 text-rose-400 text-xs">
            <Info className="w-5 h-5" />
            <p>{error}</p>
          </div>
        ) : !data || data.series.length === 0 ? (
          <div className="h-[380px] flex flex-col items-center justify-center space-y-2 text-slate-500 text-xs">
            <Info className="w-5 h-5" />
            <p>No time-series data records found for the selected filters.</p>
          </div>
        ) : scales ? (
          <div className="relative">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto select-none"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {yTicks.map((tick, i) => {
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

              {/* Time X-axis ticks */}
              {xLabels.map((lbl, i) => (
                <g key={`x-lbl-${i}`}>
                  <line
                    x1={lbl.x}
                    y1={margin.top + innerHeight}
                    x2={lbl.x}
                    y2={margin.top + innerHeight + 6}
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text
                    x={lbl.x}
                    y={margin.top + innerHeight + 18}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {lbl.text}
                  </text>
                </g>
              ))}

              {/* Y-axis Title */}
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
                {variable}
              </text>

              {/* Continuous Segments (Preserving Gaps) */}
              {pathSegments.map((d, i) => (
                <path
                  key={`seg-${i}`}
                  d={d}
                  fill="none"
                  stroke="url(#line-gradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Hover overlay column bands */}
              {data.series.map((pt, i) => {
                const x = scales.scaleX(i);
                const colWidth = innerWidth / Math.max(1, data.series.length);
                const isHovered = hoveredIndex === i;

                return (
                  <g key={`col-${i}`}>
                    {/* Hit area */}
                    <rect
                      x={x - colWidth / 2}
                      y={margin.top}
                      width={Math.max(1, colWidth)}
                      height={innerHeight}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredIndex(i)}
                    />

                    {/* Active vertical crosshair */}
                    {isHovered && (
                      <line
                        x1={x}
                        y1={margin.top}
                        x2={x}
                        y2={margin.top + innerHeight}
                        stroke="#06b6d4"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}

                    {/* Point dot if valid and hovered */}
                    {isHovered && pt.value !== null && (
                      <circle
                        cx={x}
                        cy={scales.scaleY(pt.value)}
                        r="5"
                        fill="#ffffff"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                        className="animate-pulse"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Interactive Tooltip Card */}
            {hoveredIndex !== null && data.series[hoveredIndex] && (
              <div
                className="absolute z-30 pointer-events-none p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-2xl backdrop-blur-md text-xs space-y-1 font-mono transform -translate-x-1/2 -translate-y-full mb-3"
                style={{
                  left: `${scales.scaleX(hoveredIndex)}px`,
                  top: `${
                    data.series[hoveredIndex].value !== null
                      ? scales.scaleY(data.series[hoveredIndex].value!) - 10
                      : margin.top + innerHeight / 2
                  }px`,
                }}
              >
                <p className="text-slate-300 font-bold border-b border-slate-800 pb-1">
                  {data.series[hoveredIndex].time}
                </p>
                {data.series[hoveredIndex].value !== null ? (
                  <>
                    <p className="text-cyan-300 font-bold text-sm">
                      {variable}: {data.series[hoveredIndex].value}
                    </p>
                    {data.series[hoveredIndex].min !== undefined && (
                      <p className="text-[10px] text-slate-400">
                        Range: {data.series[hoveredIndex].min} – {data.series[hoveredIndex].max}
                      </p>
                    )}
                    <p className="text-[10px] text-teal-400">
                      Aggregated Samples: {data.series[hoveredIndex].count}
                    </p>
                  </>
                ) : (
                  <p className="text-amber-400 text-xs italic">
                    Missing observation (Gap in data)
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Gap Footnote */}
      <div className="flex items-center space-x-2 text-[11px] text-slate-500 px-1">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
        <span>
          Missing observations are rendered as broken line gaps to prevent false data interpolation.
        </span>
      </div>
    </div>
  );
}

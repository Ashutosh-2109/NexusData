'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  BarChart2,
  TrendingUp,
  Database
} from 'lucide-react';
import ScatterPlot from './ScatterPlot';
import TimeSeriesChart from './TimeSeriesChart';
import DistributionChart from './DistributionChart';

interface VisualizationModuleProps {
  columnsMeta?: Array<{
    name: string;
    type: 'numeric' | 'datetime' | 'categorical';
    null_count: number;
    null_pct: number;
  }>;
  columns: string[];
  fileSummaries?: Array<{
    filename: string;
    columns: string[];
  }>;
  timeRange?: { start: string; end: string } | null;
  uniqueLocations?: string[];
}

export default function VisualizationModule({
  columnsMeta,
  columns,
  fileSummaries,
  timeRange,
  uniqueLocations = [],
}: VisualizationModuleProps) {
  const [activeChart, setActiveChart] = useState<'scatter' | 'timeseries' | 'distribution'>('scatter');
  const [selectedDataset, setSelectedDataset] = useState<string>('all');

  // Identify numeric variables
  const numericVariables = useMemo(() => {
    if (columnsMeta && columnsMeta.length > 0) {
      return columnsMeta
        .filter(
          (c) =>
            c.type === 'numeric' &&
            c.name !== 'Standardized_Time' &&
            c.name !== 'Standardized_Location'
        )
        .map((c) => c.name);
    }
    // Fallback: exclude known non-numerics
    return columns.filter(
      (c) =>
        c !== 'Standardized_Time' &&
        c !== 'Standardized_Location' &&
        !c.toLowerCase().includes('time') &&
        !c.toLowerCase().includes('date') &&
        !c.toLowerCase().includes('city')
    );
  }, [columnsMeta, columns]);

  // Dataset-to-column mapping
  const datasetColumnMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (fileSummaries) {
      fileSummaries.forEach((f) => {
        f.columns.forEach((col) => {
          map[col] = f.filename;
        });
      });
    }
    return map;
  }, [fileSummaries]);

  // Datasets list
  const datasets = useMemo(() => {
    if (!fileSummaries) return [];
    return fileSummaries.map((f) => f.filename);
  }, [fileSummaries]);

  // Filtered numeric variables based on dataset selector
  const filteredVariables = useMemo(() => {
    if (selectedDataset === 'all' || !fileSummaries) return numericVariables;
    const ds = fileSummaries.find((f) => f.filename === selectedDataset);
    if (!ds) return numericVariables;
    return numericVariables.filter((v) => ds.columns.includes(v));
  }, [numericVariables, selectedDataset, fileSummaries]);

  return (
    <div className="space-y-6">
      {/* Module Toolbar: Chart type switcher & Global Dataset filter */}
      <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Navigation Tabs for Chart Types */}
        <div className="flex bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveChart('scatter')}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center space-x-2 ${
              activeChart === 'scatter'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>1. Scatter Plot (Bivariate)</span>
          </button>

          <button
            onClick={() => setActiveChart('timeseries')}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center space-x-2 ${
              activeChart === 'timeseries'
                ? 'bg-gradient-to-r from-teal-500 to-indigo-500 text-white shadow-md shadow-teal-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LineChart className="w-4 h-4" />
            <span>2. Time-Series Line Chart</span>
          </button>

          <button
            onClick={() => setActiveChart('distribution')}
            className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center space-x-2 ${
              activeChart === 'distribution'
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>3. Distribution (Histogram &amp; Box)</span>
          </button>
        </div>

        {/* Global Dataset Filter */}
        {datasets.length > 0 && (
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 flex items-center space-x-1">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>Dataset Filter:</span>
            </span>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="all">All Datasets Combined</option>
              {datasets.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* RENDER ACTIVE CHART */}
      {activeChart === 'scatter' && (
        <ScatterPlot
          availableVariables={filteredVariables.length > 0 ? filteredVariables : numericVariables}
          initialX={filteredVariables[0] || numericVariables[0]}
          initialY={filteredVariables[1] || numericVariables[1] || numericVariables[0]}
          datasetColumnMap={datasetColumnMap}
        />
      )}

      {activeChart === 'timeseries' && (
        <TimeSeriesChart
          availableVariables={filteredVariables.length > 0 ? filteredVariables : numericVariables}
          initialVariable={filteredVariables[0] || numericVariables[0]}
          availableLocations={uniqueLocations}
          datasetColumnMap={datasetColumnMap}
          defaultTimeRange={timeRange}
        />
      )}

      {activeChart === 'distribution' && (
        <DistributionChart
          availableVariables={filteredVariables.length > 0 ? filteredVariables : numericVariables}
          initialVariable={filteredVariables[0] || numericVariables[0]}
          datasetColumnMap={datasetColumnMap}
        />
      )}
    </div>
  );
}

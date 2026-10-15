'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Layers,
  Calendar,
  MapPin,
  Activity,
  Download,
  RefreshCw,
  Search,
  Database,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Trash2,
  Clock,
  BarChart3,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  TrendingUp,
  Link2,
  Filter,
  Info,
  LineChart,
  X
} from 'lucide-react';
import AIInsightPanel, { RelationshipData } from '../components/AIInsightPanel';
import VisualizationModule from '../components/charts/VisualizationModule';
import InsightGraph from '../components/InsightGraph';
import { API_BASE } from '../config/api';

interface ColumnMeta {
  name: string;
  type: 'numeric' | 'datetime' | 'categorical';
  null_count: number;
  null_pct: number;
  non_null_count: number;
  min?: number;
  max?: number;
  mean?: number;
}

interface FileSummary {
  filename: string;
  original_rows: number;
  valid_rows_after_time_parse: number;
  resampled_rows: number;
  detected_time_col: string | null;
  detected_location_col: string | null;
  columns: string[];
}

interface MergeSummary {
  total_rows: number;
  total_columns: number;
  columns: string[];
  columns_meta?: ColumnMeta[];
  time_range?: { start: string; end: string } | null;
  unique_locations?: string[];
  file_summaries?: FileSummary[];
}

interface MergeResponse {
  message: string;
  summary: MergeSummary;
  sample_data: Record<string, any>[];
  correlations?: RelationshipData[];
  csv_download?: string;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [result, setResult] = useState<MergeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visualizations' | 'graph' | 'relationships' | 'explorer' | 'schema' | 'lineage'>('visualizations');
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Selected relationship for AI Insight Panel
  const [selectedRelationship, setSelectedRelationship] = useState<RelationshipData | null>(null);

  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColumnFilter, setSelectedColumnFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isDragging, setIsDragging] = useState(false);

  // Correlation filter & sort state
  const [corrSearch, setCorrSearch] = useState('');
  const [corrDatasetFilter, setCorrDatasetFilter] = useState('all');
  const [corrVariableFilter, setCorrVariableFilter] = useState('all');
  const [corrSortBy, setCorrSortBy] = useState<'strongest' | 'weakest' | 'pearson' | 'spearman' | 'mutual_information'>('strongest');
  const [crossDatasetOnly, setCrossDatasetOnly] = useState(false);
  const [minSampleFilter, setMinSampleFilter] = useState(10);

  // Check backend health on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, []);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith('.csv')
      );
      if (droppedFiles.length === 0) {
        setError('Please drop valid .csv files.');
        return;
      }
      setFiles((prev) => [...prev, ...droppedFiles]);
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setLoadingStep('Uploading and reading CSV files...');
    setError(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      setTimeout(() => setLoadingStep('Standardizing time axes & normalizing locations...'), 800);
      setTimeout(() => setLoadingStep('Resampling frequencies to hourly intervals...'), 1800);
      setTimeout(() => setLoadingStep('Synthesizing cross-domain join & computing correlations...'), 2600);

      const response = await fetch(`${API_BASE}/api/upload-and-merge`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.detail || 'Failed to process and merge datasets');
      }

      setResult(data);
      setCurrentPage(1);
      setActiveTab('visualizations');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during processing.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleLoadSampleData = async () => {
    setLoading(true);
    setLoadingStep('Fetching bundled datasets (AQI, Weather, Grid Load)...');
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/load-samples`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.detail || 'Failed to load sample datasets');
      }

      setResult(data);
      setCurrentPage(1);
      setActiveTab('visualizations');
    } catch (err: any) {
      setError(err.message || 'Could not load bundled datasets. Please ensure backend is running.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleDownloadCSV = () => {
    if (!result?.csv_download) return;
    const blob = new Blob([result.csv_download], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `nexus_merged_dataset_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered and paginated sample data
  const filteredData = useMemo(() => {
    if (!result?.sample_data) return [];
    if (!searchQuery.trim()) return result.sample_data;

    const query = searchQuery.toLowerCase();
    return result.sample_data.filter((row) =>
      Object.entries(row).some(([key, val]) => {
        if (selectedColumnFilter !== 'all' && key !== selectedColumnFilter) return false;
        return val !== null && String(val).toLowerCase().includes(query);
      })
    );
  }, [result, searchQuery, selectedColumnFilter]);

  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  // Unique datasets and variables for correlation filters
  const uniqueCorrDatasets = useMemo(() => {
    if (!result?.correlations) return [];
    const sets = new Set<string>();
    result.correlations.forEach((c) => {
      if (c.dataset_a) sets.add(c.dataset_a);
      if (c.dataset_b) sets.add(c.dataset_b);
    });
    return Array.from(sets);
  }, [result]);

  const uniqueCorrVariables = useMemo(() => {
    if (!result?.correlations) return [];
    const vars = new Set<string>();
    result.correlations.forEach((c) => {
      vars.add(c.variable_a);
      vars.add(c.variable_b);
    });
    return Array.from(vars);
  }, [result]);

  // Filtered and sorted correlation relationships
  const processedCorrelations = useMemo(() => {
    if (!result?.correlations) return [];

    let filtered = result.correlations.filter((rel) => {
      if (crossDatasetOnly && !rel.is_cross_dataset) return false;
      if (rel.sample_count < minSampleFilter) return false;

      if (corrDatasetFilter !== 'all') {
        const d = corrDatasetFilter.toLowerCase();
        if (!rel.dataset_a.toLowerCase().includes(d) && !rel.dataset_b.toLowerCase().includes(d)) {
          return false;
        }
      }

      if (corrVariableFilter !== 'all') {
        const v = corrVariableFilter.toLowerCase();
        if (rel.variable_a.toLowerCase() !== v && rel.variable_b.toLowerCase() !== v) {
          return false;
        }
      }

      if (corrSearch.trim()) {
        const q = corrSearch.toLowerCase();
        const matchesName =
          rel.variable_a.toLowerCase().includes(q) ||
          rel.variable_b.toLowerCase().includes(q) ||
          rel.dataset_a.toLowerCase().includes(q) ||
          rel.dataset_b.toLowerCase().includes(q);
        if (!matchesName) return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (corrSortBy === 'weakest') {
        return a.rank_score - b.rank_score;
      } else if (corrSortBy === 'pearson') {
        return Math.abs(b.pearson ?? 0) - Math.abs(a.pearson ?? 0);
      } else if (corrSortBy === 'spearman') {
        return Math.abs(b.spearman ?? 0) - Math.abs(a.spearman ?? 0);
      } else if (corrSortBy === 'mutual_information') {
        return (b.mutual_information ?? 0) - (a.mutual_information ?? 0);
      } else {
        return (
          (b.is_cross_dataset === a.is_cross_dataset ? 0 : b.is_cross_dataset ? 1 : -1) ||
          b.rank_score - a.rank_score ||
          (b.mutual_information ?? 0) - (a.mutual_information ?? 0)
        );
      }
    });

    return sorted;
  }, [
    result,
    crossDatasetOnly,
    minSampleFilter,
    corrDatasetFilter,
    corrVariableFilter,
    corrSearch,
    corrSortBy,
  ]);

  const getStrengthBadgeClass = (strength: string) => {
    if (strength.includes('Very Strong')) {
      return 'bg-emerald-950 text-emerald-300 border-emerald-800/80';
    } else if (strength.includes('Strong')) {
      return 'bg-teal-950 text-teal-300 border-teal-800/80';
    } else if (strength.includes('Moderate')) {
      return 'bg-cyan-950 text-cyan-300 border-cyan-800/80';
    } else if (strength.includes('Weak') && !strength.includes('Very Weak')) {
      return 'bg-amber-950 text-amber-300 border-amber-800/80';
    } else {
      return 'bg-slate-900 text-slate-400 border-slate-800';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  NexusData
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 flex items-center space-x-1">
                  <BarChart3 className="w-3 h-3 text-cyan-400" />
                  <span>EDA Visualizer</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Cross-Domain Insight Discovery Engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendOnline === true
                    ? 'bg-emerald-400 animate-pulse shadow-emerald-400/50 shadow'
                    : backendOnline === false
                    ? 'bg-rose-500'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300">
                {backendOnline === true
                  ? 'API Connected (Port 8000)'
                  : backendOnline === false
                  ? 'API Disconnected'
                  : 'Connecting...'}
              </span>
            </div>

            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-900"
            >
              <span>API Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        {/* Hero Section */}
        <section className="relative text-center space-y-4 pt-4 pb-2">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 text-xs font-medium shadow-inner">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interactive Exploratory Data Analysis &amp; Visual Analytics</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-tight">
            Harmonize Datasets &amp;{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              Visualize Statistical Patterns
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Consumes harmonized multi-domain data to render bivariate scatter plots with regression,
            chronological time-series lines with explicit missing data gaps, and univariate distribution histograms.
          </p>
        </section>

        {/* Upload & Action Card */}
        <section className="bg-slate-900/80 rounded-2xl border border-slate-800/90 shadow-2xl p-6 sm:p-8 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-6">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/20 scale-[0.99]'
                  : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-950/70'
              }`}
              onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <input
                id="file-upload-input"
                type="file"
                multiple
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 shadow-inner">
                <UploadCloud className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-bold text-white mb-1">
                Drop your CSV datasets here, or <span className="text-cyan-400 underline decoration-cyan-400/30 underline-offset-4">browse</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Upload multiple CSV files with timestamps and numeric columns to unlock interactive visualizations.
              </p>
            </div>

            {/* Selected Files List */}
            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Selected Datasets ({files.length})</span>
                  <button
                    onClick={clearFiles}
                    className="text-rose-400 hover:text-rose-300 transition-colors flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear all</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 text-sm group"
                    >
                      <div className="flex items-center space-x-2.5 overflow-hidden">
                        <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <p className="truncate font-medium text-slate-200 text-xs">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-700/50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                onClick={handleUpload}
                disabled={loading || files.length === 0}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all shadow-xl flex items-center justify-center space-x-2.5 ${
                  loading || files.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : 'bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-600 text-white hover:opacity-95 hover:scale-[1.02] shadow-cyan-500/20 ring-1 ring-white/20 active:scale-[0.98]'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Processing & Correlating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Harmonize & Discover Insights ({files.length})</span>
                  </>
                )}
              </button>

              <span className="text-xs text-slate-500 font-medium">or</span>

              <button
                onClick={handleLoadSampleData}
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-sm bg-slate-800/90 hover:bg-slate-700/90 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition-all flex items-center justify-center space-x-2 shadow-lg"
              >
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Load Bundled Demo Data (AQI + Weather + Grid)</span>
              </button>
            </div>

            {loading && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-center space-y-2 animate-pulse">
                <p className="text-xs text-cyan-400 font-medium">{loadingStep}</p>
                <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden">
                  <div className="w-full h-full bg-gradient-to-r from-cyan-500 to-indigo-500 animate-pulse" />
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/70 text-rose-300 text-xs flex items-start space-x-3">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-rose-200">Execution Error</p>
                  <p className="text-rose-300/90">{error}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Results Workspace */}
        {result && (
          <section className="space-y-6 animate-fade-in-up">
            {/* KPI Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-lg">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                  <span>Total Records</span>
                  <Activity className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {result.summary.total_rows.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-400 font-medium mt-1">Hourly Resampled</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-lg">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                  <span>Discovered Pairs</span>
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {result.correlations?.length || 0}
                </div>
                <p className="text-[11px] text-cyan-400 mt-1">Statistical associations</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-lg">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                  <span>Aligned Dimensions</span>
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {result.summary.total_columns || result.summary.columns.length}
                </div>
                <p className="text-[11px] text-indigo-400 mt-1">Numerical variables</p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-lg">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                  <span>Time Span</span>
                  <Calendar className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-sm sm:text-base font-bold text-white truncate">
                  {result.summary.time_range ? (
                    <>
                      <span>{result.summary.time_range.start.split(' ')[0]}</span>
                      <span className="text-slate-500 mx-1">→</span>
                      <span>{result.summary.time_range.end.split(' ')[0]}</span>
                    </>
                  ) : (
                    'Aligned'
                  )}
                </div>
                <p className="text-[11px] text-purple-400 mt-1">Continuous time horizon</p>
              </div>
            </div>

            {/* Results Container */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800/90 shadow-2xl overflow-hidden backdrop-blur-md">
              {/* Header with Tabs & Download */}
              <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Analytics &amp; Interactive EDA Visualizer</h2>
                    <p className="text-xs text-slate-400">
                      Explore bivariate relationships, chronological trajectories, and feature distributions.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                  <button
                    onClick={handleDownloadCSV}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Merged CSV</span>
                  </button>

                  <div className="flex bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setActiveTab('visualizations')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                        activeTab === 'visualizations'
                          ? 'bg-slate-800 text-cyan-300 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Visualizations</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('graph')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                        activeTab === 'graph'
                          ? 'bg-slate-800 text-cyan-300 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Insight Graph</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('relationships')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                        activeTab === 'relationships'
                          ? 'bg-slate-800 text-cyan-300 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Relationships ({result.correlations?.length || 0})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('explorer')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                        activeTab === 'explorer'
                          ? 'bg-slate-800 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Data Explorer
                    </button>
                    <button
                      onClick={() => setActiveTab('schema')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                        activeTab === 'schema'
                          ? 'bg-slate-800 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Schema & Quality
                    </button>
                    <button
                      onClick={() => setActiveTab('lineage')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                        activeTab === 'lineage'
                          ? 'bg-slate-800 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Lineage
                    </button>
                  </div>
                </div>
              </div>

              {/* TAB 1: INTERACTIVE EDA VISUALIZATIONS */}
              {activeTab === 'visualizations' && (
                <div className="p-6">
                  <VisualizationModule
                    columnsMeta={result.summary.columns_meta}
                    columns={result.summary.columns}
                    fileSummaries={result.summary.file_summaries}
                    timeRange={result.summary.time_range}
                    uniqueLocations={result.summary.unique_locations}
                  />
                </div>
              )}

              {/* TAB: INSIGHT GRAPH */}
              {activeTab === 'graph' && result.correlations && (
                <div className="p-6">
                  <InsightGraph
                    relationships={result.correlations}
                    columnsMeta={result.summary.columns_meta}
                    onOpenRelationshipExplorer={(rel) => {
                      setActiveTab('relationships');
                      setCorrSearch(rel.variable_a);
                      setSelectedRelationship(rel);
                    }}
                    onExplainWithAI={(rel) => {
                      setSelectedRelationship(rel);
                    }}
                    onViewVisualization={(xVar, yVar) => {
                      setActiveTab('visualizations');
                    }}
                    contextInfo={{
                      time_range: result.summary.time_range
                        ? `${result.summary.time_range.start} → ${result.summary.time_range.end}`
                        : undefined,
                      locations: result.summary.unique_locations,
                      total_records: result.summary.total_rows,
                    }}
                  />
                </div>
              )}

              {/* TAB 2: DISCOVERED RELATIONSHIPS (CARDS) */}
              {activeTab === 'relationships' && (
                <div className="p-6 space-y-6">
                  {/* Controls Toolbar */}
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-4">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                      {/* Search */}
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        <input
                          type="text"
                          placeholder="Search variable or dataset name..."
                          value={corrSearch}
                          onChange={(e) => setCorrSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                      </div>

                      {/* Filter by Dataset */}
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400 whitespace-nowrap">Dataset:</span>
                        <select
                          value={corrDatasetFilter}
                          onChange={(e) => setCorrDatasetFilter(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="all">All Datasets</option>
                          {uniqueCorrDatasets.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Filter by Variable */}
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400 whitespace-nowrap">Variable:</span>
                        <select
                          value={corrVariableFilter}
                          onChange={(e) => setCorrVariableFilter(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="all">All Variables</option>
                          {uniqueCorrVariables.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Sort Strategy */}
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400 whitespace-nowrap">Sort:</span>
                        <select
                          value={corrSortBy}
                          onChange={(e) => setCorrSortBy(e.target.value as any)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-medium text-cyan-400"
                        >
                          <option value="strongest">Strongest Association</option>
                          <option value="weakest">Weakest Association</option>
                          <option value="pearson">Highest Pearson (|r|)</option>
                          <option value="spearman">Highest Spearman (|r|)</option>
                          <option value="mutual_information">Highest Mutual Info</option>
                        </select>
                      </div>
                    </div>

                    {/* Toggle and info row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs">
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer text-slate-300 select-none">
                          <input
                            type="checkbox"
                            checked={crossDatasetOnly}
                            onChange={(e) => setCrossDatasetOnly(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                          <span className="font-medium text-cyan-300">Cross-Dataset Only</span>
                        </label>

                        <div className="flex items-center space-x-1.5 text-slate-400">
                          <span>Min Overlapping Samples:</span>
                          <select
                            value={minSampleFilter}
                            onChange={(e) => setMinSampleFilter(Number(e.target.value))}
                            className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200"
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 text-slate-500 text-[11px]">
                        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Showing {processedCorrelations.length} relationships. Click &ldquo;Explain with AI&rdquo; to interpret.</span>
                      </div>
                    </div>
                  </div>

                  {/* Discovered Relationship Cards Grid */}
                  {processedCorrelations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {processedCorrelations.map((rel, idx) => (
                        <div
                          key={idx}
                          className="p-5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all shadow-md flex flex-col justify-between space-y-4 group"
                        >
                          {/* Card Header: Variable Pair and Badges */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              {rel.is_cross_dataset ? (
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-950/90 text-indigo-400 border border-indigo-800/60">
                                  <Link2 className="w-3 h-3" />
                                  <span>Cross-Dataset</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-slate-400 border border-slate-800">
                                  <span>Intra-Dataset</span>
                                </span>
                              )}

                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStrengthBadgeClass(
                                  rel.relationship_strength
                                )}`}
                              >
                                {rel.relationship_strength}
                              </span>
                            </div>

                            {/* Variable A <-> Variable B */}
                            <div className="pt-1">
                              <div className="text-base font-bold text-white flex items-center justify-between font-mono">
                                <span className="text-cyan-300 truncate" title={rel.variable_a}>
                                  {rel.variable_a}
                                </span>
                                <span className="text-slate-500 mx-2 text-xs font-sans">↔</span>
                                <span className="text-teal-300 truncate text-right" title={rel.variable_b}>
                                  {rel.variable_b}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                                <span className="truncate max-w-[45%]" title={rel.dataset_a}>
                                  {rel.dataset_a}
                                </span>
                                <span className="truncate max-w-[45%] text-right" title={rel.dataset_b}>
                                  {rel.dataset_b}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Statistical Metrics Strip */}
                          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-center font-mono text-xs">
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Pearson</p>
                              <p
                                className={`font-bold ${
                                  rel.pearson === null
                                    ? 'text-slate-600'
                                    : Math.abs(rel.pearson) > 0.4
                                    ? 'text-cyan-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {rel.pearson !== null ? rel.pearson : 'N/A'}
                              </p>
                            </div>

                            <div className="space-y-0.5 border-x border-slate-800/80">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Spearman</p>
                              <p
                                className={`font-bold ${
                                  rel.spearman === null
                                    ? 'text-slate-600'
                                    : Math.abs(rel.spearman) > 0.4
                                    ? 'text-teal-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {rel.spearman !== null ? rel.spearman : 'N/A'}
                              </p>
                            </div>

                            <div className="space-y-0.5">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mutual Info</p>
                              <p
                                className={`font-bold ${
                                  rel.mutual_information === null
                                    ? 'text-slate-600'
                                    : rel.mutual_information > 0.1
                                    ? 'text-indigo-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {rel.mutual_information !== null ? rel.mutual_information : 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Footer Info & Explain with AI Trigger */}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                            <span className="flex items-center space-x-1">
                              <span className="text-slate-500">Samples:</span>
                              <span className="font-mono font-semibold text-slate-300">
                                {rel.sample_count.toLocaleString()}
                              </span>
                            </span>

                            <button
                              onClick={() => setSelectedRelationship(rel)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-800/60 font-medium transition-colors flex items-center space-x-1 text-[11px]"
                            >
                              <Sparkles className="w-3 h-3 text-indigo-400" />
                              <span>Explain with AI</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                      <TrendingUp className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-sm font-semibold text-slate-300">No relationships match the selected filters</p>
                      <p className="text-xs text-slate-500">
                        Try clearing your search query or adjusting the minimum samples requirement.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: DATA EXPLORER */}
              {activeTab === 'explorer' && (
                <div className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="Search values in preview..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>

                    <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                      <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Filter Column:</span>
                      </div>
                      <select
                        value={selectedColumnFilter}
                        onChange={(e) => {
                          setSelectedColumnFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="all">All Columns</option>
                        {result.summary.columns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>

                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                      >
                        <option value={10}>10 / page</option>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-950 text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                          {result.summary.columns.map((col) => (
                            <th key={col} className="px-4 py-3 whitespace-nowrap">
                              <span className="flex items-center space-x-1.5">
                                <span>{col}</span>
                                {col === 'Standardized_Time' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                                    TIME
                                  </span>
                                )}
                                {col === 'Standardized_Location' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800 font-mono">
                                    LOC
                                  </span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {paginatedData.length > 0 ? (
                          paginatedData.map((row, i) => (
                            <tr
                              key={i}
                              className="hover:bg-slate-800/40 transition-colors odd:bg-slate-900/20 even:bg-slate-900/40"
                            >
                              {result.summary.columns.map((col) => (
                                <td key={col} className="px-4 py-3 whitespace-nowrap">
                                  {row[col] !== null && row[col] !== undefined ? (
                                    <span
                                      className={
                                        col === 'Standardized_Time'
                                          ? 'text-cyan-300 font-semibold'
                                          : col === 'Standardized_Location'
                                          ? 'text-purple-300 capitalize'
                                          : typeof row[col] === 'number'
                                          ? 'text-slate-200'
                                          : 'text-slate-300'
                                      }
                                    >
                                      {typeof row[col] === 'number'
                                        ? Number(row[col]).toFixed(2)
                                        : String(row[col])}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 italic">null</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={result.summary.columns.length}
                              className="px-4 py-8 text-center text-slate-500"
                            >
                              No records match query &quot;{searchQuery}&quot;
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 px-1">
                    <div>
                      Showing{' '}
                      <span className="font-semibold text-slate-200">
                        {paginatedData.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}
                      </span>{' '}
                      to{' '}
                      <span className="font-semibold text-slate-200">
                        {Math.min(currentPage * rowsPerPage, filteredData.length)}
                      </span>{' '}
                      of{' '}
                      <span className="font-semibold text-slate-200">
                        {filteredData.length} preview rows
                      </span>{' '}
                      ({result.summary.total_rows.toLocaleString()} total rows in dataset)
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4 text-slate-300" />
                      </button>
                      <span className="px-2 font-mono text-slate-300">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SCHEMA & QUALITY */}
              {activeTab === 'schema' && (
                <div className="p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Auto-Detected Schema & Quality Metrics
                    </h3>
                    <p className="text-xs text-slate-400">
                      Overview of synthesized columns, non-null counts, and range statistics.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {result.summary.columns_meta?.map((meta) => (
                      <div
                        key={meta.name}
                        className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-200 truncate font-mono">
                            {meta.name}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              meta.type === 'datetime'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60'
                                : meta.type === 'categorical'
                                ? 'bg-purple-950 text-purple-400 border border-purple-800/60'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            }`}
                          >
                            {meta.type}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>Completeness</span>
                            <span className="font-mono text-slate-200">
                              {(100 - meta.null_pct).toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                              style={{ width: `${100 - meta.null_pct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-500">
                            {meta.non_null_count.toLocaleString()} valid /{' '}
                            {meta.null_count.toLocaleString()} nulls
                          </p>
                        </div>

                        {meta.type === 'numeric' && meta.min !== undefined && (
                          <div className="pt-2 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-[10px] font-mono">
                            <div>
                              <p className="text-slate-500 uppercase">Min</p>
                              <p className="text-slate-300 font-bold">{meta.min}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase">Mean</p>
                              <p className="text-slate-300 font-bold">{meta.mean}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 uppercase">Max</p>
                              <p className="text-slate-300 font-bold">{meta.max}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: INGESTION LINEAGE */}
              {activeTab === 'lineage' && (
                <div className="p-6 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Data Lineage & Pipeline Traceability
                    </h3>
                    <p className="text-xs text-slate-400">
                      Step-by-step transformations detected across each ingested dataset.
                    </p>
                  </div>

                  {result.summary.file_summaries && result.summary.file_summaries.length > 0 ? (
                    <div className="space-y-4">
                      {result.summary.file_summaries.map((file, idx) => (
                        <div
                          key={idx}
                          className="p-5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/60 pb-3">
                            <div className="flex items-center space-x-2.5">
                              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                              <span className="font-bold text-sm text-white font-mono">
                                {file.filename}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">
                              {file.original_rows.toLocaleString()} raw records →{' '}
                              <span className="text-cyan-400 font-semibold">
                                {file.resampled_rows.toLocaleString()} hourly buckets
                              </span>
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                              <p className="text-slate-500 text-[11px] mb-1">Detected Time Axis</p>
                              <p className="font-mono font-bold text-cyan-300">
                                {file.detected_time_col || 'None detected'}
                              </p>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                              <p className="text-slate-500 text-[11px] mb-1">Detected Geo Axis</p>
                              <p className="font-mono font-bold text-purple-300">
                                {file.detected_location_col || 'No spatial column (broadcast)'}
                              </p>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                              <p className="text-slate-500 text-[11px] mb-1">Original Columns</p>
                              <p className="font-mono font-bold text-slate-300">
                                {file.columns.length} columns detected
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] text-slate-500 mb-1.5">Original Attributes:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {file.columns.map((c) => (
                                <span
                                  key={c}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Lineage metadata available for newly processed datasets.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* AI INSIGHT SIDE-PANEL / MODAL */}
      {selectedRelationship && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <AIInsightPanel
            relationship={selectedRelationship}
            contextInfo={{
              time_range: result?.summary?.time_range
                ? `${result.summary.time_range.start} to ${result.summary.time_range.end}`
                : 'Harmonized period',
              locations: result?.summary?.unique_locations,
              aggregation: '1 hour mean',
            }}
            onClose={() => setSelectedRelationship(null)}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 px-6 text-center text-xs text-slate-500 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium text-slate-400">NexusData Engine</span>
            <span>—</span>
            <span>Exploratory Data Analysis Automated Framework</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>FastAPI Backend</span>
            </span>
            <span className="flex items-center space-x-1">
              <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Interactive SVG Visualizer</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import cytoscape, { Core, EventObject } from 'cytoscape';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Sliders,
  Search,
  Database,
  Layers,
  Link2,
  X,
  AlertTriangle,
  Lightbulb,
  Maximize2,
  ExternalLink,
  LineChart,
  LayoutGrid
} from 'lucide-react';
import { RelationshipData } from './AIInsightPanel';
import { API_BASE } from '../config/api';

export interface GraphNodeData {
  id: string;
  variable_name: string;
  dataset_name: string;
  variable_type: string;
  color: string;
  degree: number;
  null_pct?: number;
  mean?: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  pearson: number | null;
  spearman: number | null;
  mutual_information: number | null;
  strength: number;
  direction: 'positive' | 'negative';
  is_cross_dataset: boolean;
  sample_count: number;
  missing_percentage: number;
  color: string;
  line_style: 'solid' | 'dashed';
  width: number;
  relationship: RelationshipData;
}

interface ColumnMeta {
  name: string;
  type: string;
  null_pct?: number;
  mean?: number;
}

interface InsightGraphProps {
  relationships: RelationshipData[];
  columnsMeta?: ColumnMeta[];
  onOpenRelationshipExplorer?: (rel: RelationshipData) => void;
  onExplainWithAI?: (rel: RelationshipData) => void;
  onViewVisualization?: (xVar: string, yVar: string) => void;
  contextInfo?: {
    time_range?: string;
    locations?: string[];
    aggregation?: string;
    total_records?: number;
  };
}

const THEME_DATASET_COLORS: Record<string, string> = {
  'raw_aqi.csv': '#06b6d4', // cyan-500
  'raw_weather.csv': '#f59e0b', // amber-500
  'load_data.csv': '#a855f7', // purple-500
  'traffic.csv': '#f43f5e', // rose-500
};

const FALLBACK_PALETTE = ['#10b981', '#6366f1', '#14b8a6', '#0284c7', '#ec4899', '#84cc16'];

export default function InsightGraph({
  relationships,
  columnsMeta,
  onOpenRelationshipExplorer,
  onExplainWithAI,
  onViewVisualization,
  contextInfo,
}: InsightGraphProps) {
  // Graph controls
  const [threshold, setThreshold] = useState<number>(0.05);
  const [datasetFilter, setDatasetFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [crossOnly, setCrossOnly] = useState<boolean>(false);
  const [layoutName, setLayoutName] = useState<'cose' | 'concentric' | 'circle'>('cose');

  // Selected details
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeData | null>(null);

  // AI Summary Modal
  const [graphSummaryOpen, setGraphSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryData, setSummaryData] = useState<{overview: string; patterns: string[]} | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // Column metadata lookup
  const metaMap = useMemo(() => {
    const map = new Map<string, ColumnMeta>();
    columnsMeta?.forEach((m) => map.set(m.name, m));
    return map;
  }, [columnsMeta]);

  // Unique datasets
  const uniqueDatasets = useMemo(() => {
    const set = new Set<string>();
    relationships.forEach((r) => {
      if (r.dataset_a) set.add(r.dataset_a);
      if (r.dataset_b) set.add(r.dataset_b);
    });
    return Array.from(set);
  }, [relationships]);

  // Dataset color mapping
  const getDatasetColor = useCallback((ds: string) => {
    if (THEME_DATASET_COLORS[ds]) return THEME_DATASET_COLORS[ds];
    const hash = ds.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
  }, []);

  // Filtered relationships based on threshold, crossOnly, and dataset
  const filteredRelationships = useMemo(() => {
    return relationships.filter((rel) => {
      const absPearson = Math.abs(rel.pearson ?? rel.spearman ?? 0);
      if (absPearson < threshold) return false;

      if (crossOnly && !rel.is_cross_dataset) return false;

      if (datasetFilter !== 'all') {
        const matches =
          rel.dataset_a.toLowerCase() === datasetFilter.toLowerCase() ||
          rel.dataset_b.toLowerCase() === datasetFilter.toLowerCase();
        if (!matches) return false;
      }

      return true;
    });
  }, [relationships, threshold, crossOnly, datasetFilter]);

  // Build Cytoscape Elements
  const elements = useMemo(() => {
    const nodeMap = new Map<string, GraphNodeData>();

    filteredRelationships.forEach((rel) => {
      if (!nodeMap.has(rel.variable_a)) {
        const meta = metaMap.get(rel.variable_a);
        nodeMap.set(rel.variable_a, {
          id: rel.variable_a,
          variable_name: rel.variable_a,
          dataset_name: rel.dataset_a || 'Unknown',
          variable_type: meta?.type || 'numeric',
          color: getDatasetColor(rel.dataset_a),
          degree: 0,
          null_pct: meta?.null_pct,
          mean: meta?.mean,
        });
      }
      if (!nodeMap.has(rel.variable_b)) {
        const meta = metaMap.get(rel.variable_b);
        nodeMap.set(rel.variable_b, {
          id: rel.variable_b,
          variable_name: rel.variable_b,
          dataset_name: rel.dataset_b || 'Unknown',
          variable_type: meta?.type || 'numeric',
          color: getDatasetColor(rel.dataset_b),
          degree: 0,
          null_pct: meta?.null_pct,
          mean: meta?.mean,
        });
      }

      nodeMap.get(rel.variable_a)!.degree += 1;
      nodeMap.get(rel.variable_b)!.degree += 1;
    });

    const cyNodes = Array.from(nodeMap.values()).map((node) => ({
      data: {
        ...node,
        label: node.variable_name,
      },
    }));

    const cyEdges = filteredRelationships.map((rel, idx) => {
      const p = rel.pearson ?? rel.spearman ?? 0;
      const direction: 'positive' | 'negative' = p >= 0 ? 'positive' : 'negative';
      const color = direction === 'positive' ? '#06b6d4' : '#f43f5e'; // cyan vs rose
      const baseWidth = Math.max(1.8, Math.abs(p) * 6);
      const width = rel.is_cross_dataset ? baseWidth * 1.3 : baseWidth;

      const edgeData: GraphEdgeData = {
        id: `edge-${idx}-${rel.variable_a}-${rel.variable_b}`,
        source: rel.variable_a,
        target: rel.variable_b,
        pearson: rel.pearson,
        spearman: rel.spearman,
        mutual_information: rel.mutual_information,
        strength: rel.rank_score ?? Math.abs(p),
        direction,
        is_cross_dataset: rel.is_cross_dataset,
        sample_count: rel.sample_count,
        missing_percentage: rel.missing_percentage,
        color,
        line_style: direction === 'negative' ? 'dashed' : 'solid',
        width,
        relationship: rel,
      };

      return {
        data: edgeData,
      };
    });

    return [...cyNodes, ...cyEdges];
  }, [filteredRelationships, metaMap, getDatasetColor]);

  // Initialize Cytoscape Instance
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      boxSelectionEnabled: false,
      autounselectify: false,
      style: [
        // Default Node
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#f8fafc',
            'font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            'font-size': '11px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#020617',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'text-border-color': '#1e293b',
            'text-border-width': 1,
            'text-border-opacity': 0.7,
            width: 'mapData(degree, 1, 10, 22, 38)',
            height: 'mapData(degree, 1, 10, 22, 38)',
            'border-width': 2,
            'border-color': '#0f172a',
            'transition-property': 'background-color, border-color, border-width, opacity, width, height',
            'transition-duration': 150,
          },
        },
        // Selected / Highlighted Node
        {
          selector: 'node:selected, node.highlighted',
          style: {
            'border-color': '#38bdf8',
            'border-width': 4,
            'text-border-color': '#38bdf8',
            'text-border-width': 1.5,
            opacity: 1,
          },
        },
        // Dimmed Node
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.15,
          },
        },
        // Default Edge
        {
          selector: 'edge',
          style: {
            'line-color': 'data(color)',
            'line-style': 'data(line_style)' as cytoscape.Css.LineStyle,
            width: 'data(width)',
            'curve-style': 'bezier',
            opacity: 0.7,
            'line-dash-pattern': [6, 4],
            'transition-property': 'line-color, width, opacity',
            'transition-duration': 150,
          },
        },
        // Cross Dataset Edges (Priority Emphasis)
        {
          selector: 'edge[?is_cross_dataset]',
          style: {
            opacity: 0.9,
          },
        },
        // Selected / Highlighted Edge
        {
          selector: 'edge:selected, edge.highlighted',
          style: {
            opacity: 1,
            'line-color': '#38bdf8',
            width: (element: cytoscape.EdgeSingular) => Number(element.data('width')) + 2,
          },
        },
        // Dimmed Edge
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.1,
          },
        },
      ],
      layout: {
        name: layoutName,
        animate: false,
        padding: 40,
      } as cytoscape.LayoutOptions,
    });

    cyRef.current = cy;

    // Node Click Listener
    cy.on('tap', 'node', (evt: EventObject) => {
      const data = evt.target.data() as GraphNodeData;
      setSelectedNode(data);
      setSelectedEdge(null);
    });

    // Edge Click Listener
    cy.on('tap', 'edge', (evt: EventObject) => {
      const data = evt.target.data() as GraphEdgeData;
      setSelectedEdge(data);
      setSelectedNode(null);
    });

    // Background Click Listener (Deselect)
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    // Hover Highlighting
    cy.on('mouseover', 'node', (evt: EventObject) => {
      const node = evt.target;
      const connected = node.neighborhood();
      cy.elements().difference(node.union(connected)).addClass('dimmed');
      node.union(connected).addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed').removeClass('highlighted');
    });

    cy.on('mouseover', 'edge', (evt: EventObject) => {
      const edge = evt.target;
      const connected = edge.connectedNodes();
      cy.elements().difference(edge.union(connected)).addClass('dimmed');
      edge.union(connected).addClass('highlighted');
    });

    cy.on('mouseout', 'edge', () => {
      cy.elements().removeClass('dimmed').removeClass('highlighted');
    });

    // Responsive auto-fit
    cy.resize();
    cy.fit(undefined, 35);

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, layoutName]);

  // Window / Container Resize Observer for Cytoscape Responsiveness
  useEffect(() => {
    if (!containerRef.current || !cyRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current) {
        cyRef.current.resize();
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Search Live Filtering / Highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!searchQuery.trim()) {
      cy.elements().removeClass('dimmed').removeClass('highlighted');
      return;
    }

    const q = searchQuery.toLowerCase();
    const matchedNodes = cy.nodes().filter((n) => {
      const data = n.data() as GraphNodeData;
      return (
        data.variable_name.toLowerCase().includes(q) ||
        data.dataset_name.toLowerCase().includes(q)
      );
    });

    if (matchedNodes.length > 0) {
      const matchedWithEdges = matchedNodes.union(matchedNodes.connectedEdges());
      cy.elements().difference(matchedWithEdges).addClass('dimmed');
      matchedWithEdges.addClass('highlighted');
    } else {
      cy.elements().addClass('dimmed');
    }
  }, [searchQuery]);

  // Cytoscape View Controls
  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() / 1.25);
    }
  };

  const handleFitGraph = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 35);
    }
  };

  const handleResetView = () => {
    setThreshold(0.05);
    setCrossOnly(false);
    setDatasetFilter('all');
    setSearchQuery('');
    setSelectedNode(null);
    setSelectedEdge(null);
    if (cyRef.current) {
      cyRef.current.reset();
      cyRef.current.fit(undefined, 35);
    }
  };

  // Switch Layout (cose, concentric, circle)
  const handleToggleLayout = () => {
    const nextLayout = layoutName === 'cose' ? 'concentric' : layoutName === 'concentric' ? 'circle' : 'cose';
    setLayoutName(nextLayout);
  };

  // AI Graph Overview
  const handleGenerateGraphInsights = async () => {
    setGraphSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const topRels = relationships.slice(0, 15);
      const res = await fetch(`${API_BASE}/api/insights/graph-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationships: topRels,
          context: {
            time_range: contextInfo?.time_range || 'Harmonized timeline',
            total_records: contextInfo?.total_records || 0,
            locations: contextInfo?.locations || [],
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.summary) {
        setSummaryData(data.summary);
      } else {
        setSummaryError(
          data.error ||
          data.message ||
          'Graph-level AI overview unavailable. Statistical evidence is still fully accessible.'
        );
      }
    } catch {
      setSummaryError('Failed to fetch AI graph overview.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const hasEdges = elements.some((el) => 'source' in el.data);

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl text-slate-100 relative">
      {/* 1. Header & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60 font-mono flex items-center space-x-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>Cytoscape Graph</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Layout: <strong className="text-slate-200 capitalize">{layoutName}</strong>
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">
            Cross-Domain Relationship Network
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleToggleLayout}
            title="Switch Cytoscape Layout"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center space-x-1.5"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
            <span className="capitalize">{layoutName} Layout</span>
          </button>

          <button
            onClick={handleGenerateGraphInsights}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-md hover:opacity-95 transition-all flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Overview</span>
          </button>
        </div>
      </div>

      {/* 2. Minimal, Responsive Graph Controls Toolbar */}
      <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search variable or dataset..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Threshold Slider */}
        <div className="flex items-center space-x-2 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-300 font-medium">Correlation threshold:</span>
          <input
            type="range"
            min="0.00"
            max="1.00"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-20 accent-cyan-500 cursor-pointer"
          />
          <span className="font-mono font-bold text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[11px]">
            {threshold.toFixed(2)}
          </span>
        </div>

        {/* Dataset Filter */}
        <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <select
            value={datasetFilter}
            onChange={(e) => setDatasetFilter(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
          >
            <option value="all" className="bg-slate-900">All Datasets ({uniqueDatasets.length})</option>
            {uniqueDatasets.map((ds) => (
              <option key={ds} value={ds} className="bg-slate-900">
                {ds}
              </option>
            ))}
          </select>
        </div>

        {/* Cross-Domain Only */}
        <label className="flex items-center space-x-1.5 cursor-pointer bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 select-none">
          <input
            type="checkbox"
            checked={crossOnly}
            onChange={(e) => setCrossOnly(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
          />
          <span className="text-cyan-300 flex items-center space-x-1 text-xs">
            <Link2 className="w-3 h-3 text-cyan-400" />
            <span>Cross-Domain Only</span>
          </span>
        </label>

        {/* Cytoscape Zoom & Fit Buttons */}
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitGraph}
            title="Fit to Screen"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            title="Reset Graph"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Cytoscape Canvas Container */}
      <div className="relative w-full h-[520px] rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
        {/* The Cytoscape Container DOM Element */}
        <div
          ref={containerRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Empty State Overlay */}
        {!hasEdges && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/85 backdrop-blur-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-base font-bold text-white">
                No significant cross-domain relationships found for the current threshold.
              </h3>
              <p className="text-xs text-slate-400">
                Current threshold is <strong>{threshold.toFixed(2)}</strong>. Try lowering the threshold or clearing filters to inspect subtle associations.
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={() => {
                  setThreshold(0.01);
                  setCrossOnly(false);
                  setDatasetFilter('all');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 transition-colors shadow-sm"
              >
                Lower Threshold to 0.01
              </button>
              <button
                onClick={handleResetView}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        )}

        {/* Edge Semantics Minimal Overlay Legend (Top-Right) */}
        <div className="absolute top-3 right-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md space-y-1.5 text-[10px] shadow-lg pointer-events-none">
          <p className="text-slate-400 font-semibold uppercase tracking-wider">
            Semantics
          </p>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-0.5 bg-cyan-400 inline-block" />
            <span className="text-slate-200">Positive (r ≥ 0)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-0.5 border-b border-rose-400 border-dashed inline-block" />
            <span className="text-slate-200">Negative (r &lt; 0)</span>
          </div>
        </div>

        {/* Datasets Legend (Bottom-Left) */}
        <div className="absolute bottom-3 left-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 backdrop-blur-md space-y-1 text-[10px] shadow-lg max-w-[200px]">
          <p className="text-slate-400 font-semibold uppercase tracking-wider mb-1">
            Datasets
          </p>
          {uniqueDatasets.map((ds) => (
            <div key={ds} className="flex items-center space-x-1.5">
              <span
                className="w-2 h-2 rounded-full inline-block shrink-0"
                style={{ backgroundColor: getDatasetColor(ds) }}
              />
              <span className="text-slate-300 font-mono truncate">{ds}</span>
            </div>
          ))}
        </div>

        {/* Edge Inspector Drawer */}
        {selectedEdge && (
          <div className="absolute top-3 right-3 w-80 sm:w-92 bg-slate-900/95 border border-cyan-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-xl space-y-3 animate-fade-in z-20">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  {selectedEdge.is_cross_dataset ? 'Cross-Domain' : 'Intra-Domain'} Relationship
                </span>
                <h4 className="text-sm font-bold text-white mt-1.5 font-mono flex items-center space-x-1.5">
                  <span className="text-cyan-300">{selectedEdge.source}</span>
                  <span className="text-slate-500">↔</span>
                  <span className="text-teal-300">{selectedEdge.target}</span>
                </h4>
              </div>
              <button
                onClick={() => setSelectedEdge(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-center text-xs">
              <div>
                <p className="text-[9px] text-slate-400 uppercase">Pearson (r)</p>
                <p className={`font-bold ${selectedEdge.direction === 'positive' ? 'text-cyan-400' : 'text-rose-400'}`}>
                  {selectedEdge.pearson !== null ? selectedEdge.pearson : 'N/A'}
                </p>
              </div>
              <div className="border-x border-slate-800">
                <p className="text-[9px] text-slate-400 uppercase">Spearman (ρ)</p>
                <p className="font-bold text-teal-400">
                  {selectedEdge.spearman !== null ? selectedEdge.spearman : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 uppercase">Mutual Info</p>
                <p className="font-bold text-indigo-400">
                  {selectedEdge.mutual_information !== null ? selectedEdge.mutual_information : 'N/A'}
                </p>
              </div>
            </div>

            {/* Support */}
            <div className="space-y-1 text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Samples:</span>
                <span className="text-slate-200 font-bold">{selectedEdge.sample_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Missing Rate:</span>
                <span className="text-slate-200">{selectedEdge.missing_percentage.toFixed(1)}%</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => {
                  if (onOpenRelationshipExplorer) {
                    onOpenRelationshipExplorer(selectedEdge.relationship);
                  }
                }}
                className="w-full py-2 rounded-lg font-bold text-xs bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition-all flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Relationship Explorer</span>
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    if (onExplainWithAI) {
                      onExplainWithAI(selectedEdge.relationship);
                    }
                  }}
                  className="py-1.5 rounded-lg font-semibold text-xs bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/70 transition-colors flex items-center justify-center space-x-1"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Explain AI</span>
                </button>

                <button
                  onClick={() => {
                    if (onViewVisualization) {
                      onViewVisualization(selectedEdge.source, selectedEdge.target);
                    }
                  }}
                  className="py-1.5 rounded-lg font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center justify-center space-x-1"
                >
                  <LineChart className="w-3 h-3 text-cyan-400" />
                  <span>Scatter Plot</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Node Inspector Drawer */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-80 sm:w-88 bg-slate-900/95 border border-indigo-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-xl space-y-3 animate-fade-in z-20">
            <div className="flex items-start justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                  Variable Details
                </span>
                <h4 className="text-base font-bold text-white mt-1 font-mono text-cyan-300">
                  {selectedNode.variable_name}
                </h4>
                <p className="text-[11px] text-slate-400 font-mono">{selectedNode.dataset_name}</p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-center text-xs">
              <div>
                <p className="text-[9px] text-slate-400 uppercase">Type</p>
                <p className="font-bold text-slate-200 capitalize">{selectedNode.variable_type}</p>
              </div>
              <div className="border-x border-slate-800">
                <p className="text-[9px] text-slate-400 uppercase">Degree</p>
                <p className="font-bold text-cyan-400">{selectedNode.degree} links</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 uppercase">Valid</p>
                <p className="font-bold text-emerald-400">
                  {selectedNode.null_pct !== undefined ? `${(100 - selectedNode.null_pct).toFixed(0)}%` : 'N/A'}
                </p>
              </div>
            </div>

            {/* Connected Variables */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Connected Associations:
              </p>
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {filteredRelationships
                  .filter((r) => r.variable_a === selectedNode.id || r.variable_b === selectedNode.id)
                  .map((r, i) => {
                    const peer = r.variable_a === selectedNode.id ? r.variable_b : r.variable_a;
                    const p = r.pearson ?? r.spearman ?? 0;
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          const matchingEdge = elements.find(
                            (el) =>
                              'source' in el.data &&
                              ((el.data.source === selectedNode.id && el.data.target === peer) ||
                                (el.data.target === selectedNode.id && el.data.source === peer))
                          );
                          if (matchingEdge) {
                            setSelectedEdge(matchingEdge.data as GraphEdgeData);
                            setSelectedNode(null);
                          }
                        }}
                        className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors group"
                      >
                        <span className="font-mono text-slate-300 group-hover:text-cyan-300 truncate max-w-[140px]">
                          {peer}
                        </span>
                        <span className={`font-mono font-bold text-[11px] ${p >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                          r = {r.pearson !== null ? r.pearson : 'N/A'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. AI Graph Overview Modal */}
      {graphSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">CityPulse AI Overview</h3>
                  <p className="text-xs text-slate-400">
                    High-level synthesis of discovered cross-domain patterns
                  </p>
                </div>
              </div>

              <button
                onClick={() => setGraphSummaryOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {summaryLoading && (
              <div className="py-10 text-center space-y-2">
                <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-200">
                  Synthesizing graph topology with Gemini...
                </p>
              </div>
            )}

            {summaryError && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-200 text-xs flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-100">AI Overview Unavailable</p>
                  <p className="text-amber-300/80 font-mono text-[11px]">{summaryError}</p>
                </div>
              </div>
            )}

            {summaryData && (
              <div className="space-y-4 text-xs text-slate-300">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/20 space-y-1">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                    System Overview
                  </h4>
                  <p className="text-slate-200 leading-relaxed">
                    {summaryData.overview}
                  </p>
                </div>

                {summaryData.patterns && summaryData.patterns.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                      <span>Key Cross-Domain Patterns</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {summaryData.patterns.map((pat: string, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start space-x-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                          <span className="text-slate-300">{pat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

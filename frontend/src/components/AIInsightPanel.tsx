'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Clock,
  Layers,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  X
} from 'lucide-react';
import { API_BASE } from '../config/api';

export interface RelationshipData {
  dataset_a: string;
  variable_a: string;
  dataset_b: string;
  variable_b: string;
  sample_count: number;
  pearson: number | null;
  spearman: number | null;
  mutual_information: number | null;
  missing_percentage: number;
  relationship_strength: string;
  is_cross_dataset: boolean;
  rank_score: number;
}

export interface AIInsightData {
  title: string;
  summary: string;
  interpretation: string;
  possible_factors: string[];
  caution: string;
  recommended_checks: string[];
}

interface AIInsightPanelProps {
  relationship: RelationshipData | null;
  contextInfo?: {
    time_range?: string;
    locations?: string[];
    aggregation?: string;
  };
  onClose?: () => void;
}

export default function AIInsightPanel({
  relationship,
  contextInfo,
  onClose,
}: AIInsightPanelProps) {
  const [insight, setInsight] = useState<AIInsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<'idle' | 'generating' | 'generated' | 'failed'>('idle');

  if (!relationship) return null;

  const handleExplainWithAI = async () => {
    setLoading(true);
    setStatusText('generating');
    setErrorMsg(null);

    try {
      const response = await fetch(`${API_BASE}/api/insights/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship,
          context: contextInfo || {
            time_range: 'Harmonized period',
            aggregation: '1 hour mean',
          },
        }),
      });

      const data = await response.json();

      if (data.success && data.insight) {
        setInsight(data.insight);
        setStatusText('generated');
      } else {
        setStatusText('failed');
        setErrorMsg(
          data.error ||
          data.message ||
          'AI insight unavailable. The statistical relationship is still available.'
        );
      }
    } catch (err: unknown) {
      setStatusText('failed');
      setErrorMsg('Failed to communicate with AI service. The statistical evidence remains valid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 text-slate-100 max-w-2xl w-full">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/60">
              Relationship Evidence
            </span>
            {relationship.is_cross_dataset && (
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800/60">
                Cross-Domain
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            <span className="text-cyan-300 font-mono">{relationship.variable_a}</span>
            <span className="text-slate-400 font-sans mx-2">↔</span>
            <span className="text-teal-300 font-mono">{relationship.variable_b}</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {relationship.dataset_a} ({relationship.variable_a}) &bull; {relationship.dataset_b} ({relationship.variable_b})
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Deterministic Statistics Panel */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Deterministic Statistical Evidence
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <p className="text-[11px] text-slate-400">Pearson (r)</p>
            <p className="text-base font-bold text-cyan-400 font-mono">
              {relationship.pearson !== null ? relationship.pearson : 'N/A'}
            </p>
            <p className="text-[10px] text-slate-500">Linear co-movement</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <p className="text-[11px] text-slate-400">Spearman (ρ)</p>
            <p className="text-base font-bold text-teal-400 font-mono">
              {relationship.spearman !== null ? relationship.spearman : 'N/A'}
            </p>
            <p className="text-[10px] text-slate-500">Rank monotonicity</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <p className="text-[11px] text-slate-400">Mutual Information</p>
            <p className="text-base font-bold text-indigo-400 font-mono">
              {relationship.mutual_information !== null ? relationship.mutual_information : 'N/A'}
            </p>
            <p className="text-[10px] text-slate-500">Non-linear dependency</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <p className="text-[11px] text-slate-400">Sample Support</p>
            <p className="text-base font-bold text-slate-200 font-mono">
              {relationship.sample_count.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500">
              {relationship.missing_percentage.toFixed(1)}% missing
            </p>
          </div>
        </div>
      </div>

      {/* AI Insight Section */}
      <div className="space-y-4 pt-2 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Gemini AI Interpretation</h3>
              <p className="text-[11px] text-slate-400">
                Contextual hypothesis and analytical recommendations
              </p>
            </div>
          </div>

          <button
            onClick={handleExplainWithAI}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-lg ${
              statusText === 'generated'
                ? 'bg-slate-800 text-cyan-300 border border-cyan-800/60 hover:bg-slate-700'
                : 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:opacity-95 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating insight...</span>
              </>
            ) : statusText === 'generated' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI Insight Generated (Refresh)</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Explain with AI</span>
              </>
            )}
          </button>
        </div>

        {/* Failed state / error notice */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/70 text-amber-200 text-xs flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-100">
                AI insight unavailable. The statistical relationship is still available.
              </p>
              <p className="text-amber-200/80">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Generated Insight Content */}
        {insight && (
          <div className="space-y-4 animate-fade-in">
            {/* Title & Summary */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <h4 className="font-bold text-white text-sm flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>{insight.title}</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {insight.summary}
              </p>
            </div>

            {/* Contextual Domain Interpretation */}
            <div className="space-y-1.5 text-xs text-slate-300">
              <h5 className="font-semibold text-slate-200 uppercase text-[10px] tracking-wider">
                Contextual Domain Interpretation
              </h5>
              <p className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 leading-relaxed text-slate-300">
                {insight.interpretation}
              </p>
            </div>

            {/* Confounding Factors */}
            {insight.possible_factors && insight.possible_factors.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <h5 className="font-semibold text-slate-200 uppercase text-[10px] tracking-wider">
                  Potential Confounding Factors / Shared Drivers
                </h5>
                <ul className="space-y-1.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
                  {insight.possible_factors.map((factor, idx) => (
                    <li key={idx} className="flex items-start space-x-2 text-slate-300">
                      <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended Checks */}
            {insight.recommended_checks && insight.recommended_checks.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <h5 className="font-semibold text-slate-200 uppercase text-[10px] tracking-wider">
                  Recommended Follow-Up Validation
                </h5>
                <ul className="space-y-1.5 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
                  {insight.recommended_checks.map((chk, idx) => (
                    <li key={idx} className="flex items-start space-x-2 text-slate-300">
                      <ChevronRight className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                      <span>{chk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Caution Banner (Anti-causality rule) */}
            <div className="p-3 rounded-xl bg-slate-950 border border-cyan-900/60 text-slate-400 text-[11px] flex items-start space-x-2.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-cyan-300 uppercase tracking-wide">
                  Statistical Caution:{' '}
                </span>
                <span>{insight.caution}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

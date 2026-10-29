'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../config/api';
import { METRIC_LABELS, metricColor, metricValue } from './mapUtils';
import type { CityDetail, FocusArea, LivePoint, Metric } from './types';
import { useLiveCities } from './useLiveCities';

const IndiaMapCanvas = dynamic(() => import('./IndiaMapCanvas'), { ssr: false, loading: () => <div className="h-[480px] md:h-[630px] animate-pulse rounded-2xl bg-slate-800" /> });
const METRICS: Metric[] = ['aqi', 'pm25', 'temperature', 'humidity', 'load_MW'];
const FOCUS: Array<FocusArea | 'all'> = ['all', 'Air Quality', 'Heat Stress', 'Energy Demand'];
interface ScenarioResult {driver: string; target: string; baseline_target: number; projected_target: number; pearson: number | null; sample_count: number; label: string; limitations: string}

function HistoryChart({ history, metric }: {history: LivePoint[]; metric: Metric}) {
  const values = history.map(point => point.metrics[metric]);
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length < 2) return <p className="text-sm text-slate-400">No 48-hour series for this metric.</p>;
  const low = Math.min(...valid), high = Math.max(...valid), span = Math.max(high - low, 1);
  const points = values.map((value, index) => value === null || value === undefined ? null : `${(index / Math.max(values.length - 1, 1)) * 600},${120 - ((value - low) / span) * 100}`);
  const segments: string[] = [];
  let run: string[] = [];
  for (const point of [...points, null]) {
    if (point) run.push(point);
    else if (run.length) { segments.push(run.join(' ')); run = []; }
  }
  return <div>
    <svg role="img" aria-label={`48-hour ${METRIC_LABELS[metric]} series`} viewBox="0 0 600 140" className="w-full h-36 rounded-lg bg-slate-950 border border-slate-800">
      {[25, 70, 115].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#334155" strokeDasharray="4 6" />)}
      {segments.map((segment, i) => <polyline key={i} points={segment} fill="none" stroke="#22d3ee" strokeWidth="3" />)}
    </svg>
    <div className="flex justify-between text-[11px] text-slate-400"><span>{history[0]?.time.slice(0, 16)} UTC</span><span>{history.at(-1)?.time.slice(0, 16)} UTC</span></div>
  </div>;
}

export default function IndiaMap() {
  const { snapshot, status, error } = useLiveCities();
  const [metric, setMetric] = useState<Metric>('aqi');
  const [focus, setFocus] = useState<FocusArea | 'all'>('all');
  const [choropleth, setChoropleth] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CityDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [driver, setDriver] = useState('temperature');
  const [target, setTarget] = useState('pm25');
  const [changePercent, setChangePercent] = useState(-10);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/live/city/${encodeURIComponent(selected)}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`City API returned ${response.status}`); return response.json(); })
      .then((value: CityDetail) => { setDetail(value); setDetailError(null); })
      .catch((reason: Error) => { if (reason.name !== 'AbortError') setDetailError(reason.message); });
    return () => controller.abort();
  }, [selected, snapshot?.last_refresh]);

  const cities = useMemo(() => snapshot?.cities ?? [], [snapshot?.cities]);
  const withMetric = useMemo(() => cities.filter(city => metricValue(city, metric) !== null).length, [cities, metric]);
  const lastUpdated = snapshot?.last_refresh ? new Date(snapshot.last_refresh).toLocaleString() : 'No update yet';
  const scenarioVariables = detail ? Object.keys(detail.current?.metrics ?? {}).filter(key => detail.history.some(point => typeof point.metrics[key] === 'number')) : [];

  const runScenario = async () => {
    if (!selected) return;
    setScenarioError(null);
    setScenarioResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/live/city/${encodeURIComponent(selected)}/scenario`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver, target, change_percent: changePercent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? 'Scenario unavailable');
      setScenarioResult(data as ScenarioResult);
    } catch (reason) { setScenarioError(reason instanceof Error ? reason.message : 'Scenario unavailable'); }
  };

  return <section aria-label="Live India map" className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl p-4 sm:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[.25em] text-cyan-400 font-semibold">India live observatory</p>
        <h2 className="text-2xl font-bold text-white">Cities, conditions, and development areas</h2>
        <p className="text-sm text-slate-400 mt-1">Model data refreshes every 15 minutes. Station feeds are shown in city details when configured.</p></div>
      <div className="text-right"><span role="status" className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${status === 'live' ? 'bg-emerald-900 text-emerald-300' : status === 'stale' ? 'bg-amber-900 text-amber-300' : 'bg-rose-900 text-rose-300'}`}>{status}</span>
        <p className="text-xs text-slate-400 mt-1">Last updated: {lastUpdated}</p></div>
    </div>
    <div className="flex flex-wrap gap-3 items-center">
      <label className="text-xs text-slate-300">Metric <select aria-label="Map metric" value={metric} onChange={e => setMetric(e.target.value as Metric)} className="ml-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2">{METRICS.map(value => <option key={value} value={value}>{METRIC_LABELS[value]}</option>)}</select></label>
      <label className="text-xs text-slate-300">Development area <select aria-label="Development area" value={focus} onChange={e => setFocus(e.target.value as FocusArea | 'all')} className="ml-2 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2">{FOCUS.map(value => <option key={value} value={value}>{value === 'all' ? 'All cities' : value}</option>)}</select></label>
      <label className="text-xs text-slate-300 flex items-center gap-2"><input type="checkbox" checked={choropleth} onChange={e => setChoropleth(e.target.checked)} />State averages</label>
      <span className="text-xs text-slate-400 ml-auto">{withMetric} / {cities.length} cities with this metric</span>
    </div>
    {error && <p role="alert" className="rounded-lg bg-amber-950/50 border border-amber-800 p-3 text-amber-200 text-sm">{error}. Showing the latest available snapshot where possible.</p>}
    {snapshot && cities.length === 0 && <p className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-slate-300 text-sm">No city observations are available yet. The map will update when the live source returns data.</p>}
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <div className="min-w-0 relative">
        {status === 'loading' && <p className="absolute z-[500] top-3 left-3 bg-slate-950/90 px-3 py-2 rounded-lg text-xs">Loading city data…</p>}
        <IndiaMapCanvas cities={cities} metric={metric} selected={selected} focus={focus} choropleth={choropleth} onSelect={name => { setSelected(name); setDetail(null); setScenarioResult(null); }} />
      </div>
      <aside className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 max-h-[630px] overflow-y-auto space-y-4">
        {!selected && <div className="text-sm text-slate-400">Select a city marker to inspect observations, relationships, and suggested checks.</div>}
        {selected && !detail && !detailError && <p className="text-sm text-slate-400">Loading {selected}…</p>}
        {detailError && <p role="alert" className="text-rose-300 text-sm">{detailError}</p>}
        {detail && <>
          <div className="flex justify-between gap-2"><div><h3 className="font-bold text-xl text-white">{detail.city.name}</h3><p className="text-xs text-slate-400">{detail.city.state}</p></div><button aria-label="Close city details" onClick={() => { setSelected(null); setDetail(null); }} className="text-slate-400 hover:text-white">✕</button></div>
          <p className="text-xs text-slate-400">{detail.current?.source ?? 'No source'} · {detail.current?.data_quality ?? 'unavailable'} quality · {detail.current?.fetched_at ? new Date(detail.current.fetched_at).toLocaleString() : 'No observation'}</p>
          <div className="grid grid-cols-2 gap-2">{(['aqi','pm25','temperature','humidity'] as Metric[]).map(value => <div key={value} className="bg-slate-900 rounded-lg p-2"><p className="text-[11px] text-slate-400">{METRIC_LABELS[value]}</p><p className="font-bold" style={{ color: metricColor(value, detail.current?.metrics[value] ?? null) }}>{detail.current?.metrics[value]?.toFixed(1) ?? '—'}</p></div>)}</div>
          <div><h4 className="font-semibold text-sm mb-2">48-hour {METRIC_LABELS[metric]} series</h4><HistoryChart history={detail.history} metric={metric} /></div>
          <div><h4 className="font-semibold text-sm mb-2">Top correlated variables</h4>{detail.relationships.length ? detail.relationships.slice(0, 3).map((rel, i) => <p key={i} className="text-xs text-slate-300 mb-1">{rel.variable_a} ↔ {rel.variable_b}: r={rel.pearson ?? '—'} ({rel.sample_count} samples)</p>) : <p className="text-xs text-slate-400">Insufficient overlapping observations.</p>}</div>
          {!!detail.station_observations.length && <div><h4 className="font-semibold text-sm">Station observations</h4>{detail.station_observations.map((point, i) => <p key={i} className="text-xs text-slate-400">{point.source} · {point.data_quality} · PM2.5 {point.metrics.pm25 ?? '—'}</p>)}</div>}
          {detail.development && <div><h4 className="font-semibold text-sm">Development areas · score {detail.development.score ?? '—'}</h4><p className="text-[11px] text-amber-200">Indicative analysis, not policy guidance.</p><p className="text-xs text-slate-400">{detail.development.focus_areas.map(area => `${area.area} (${area.severity})`).join(', ') || 'No threshold triggered'}</p>{detail.development.suggestions.map(suggestion => <div key={suggestion.rule_id} className="mt-2 border border-cyan-900 bg-cyan-950/20 rounded-lg p-3 text-xs space-y-1"><p className="font-semibold text-cyan-200">{suggestion.action}</p><p>Evidence: {suggestion.evidence.join('; ')}</p><p>Rule: {suggestion.rule_id} · Confidence: {suggestion.confidence}</p><p>Expected direction: {suggestion.expected_direction}</p><p className="text-slate-400">Limitations: {suggestion.limitations}</p></div>)}</div>}
          <div className="border-t border-slate-800 pt-3 space-y-2"><h4 className="font-semibold text-sm">Indicative scenario</h4><p className="text-[11px] text-amber-200">Indicative analysis, not policy guidance.</p>
            <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-400">Adjust <select aria-label="Scenario driver" value={driver} onChange={e => setDriver(e.target.value)} className="block w-full bg-slate-900 border border-slate-700 rounded p-1 text-slate-100">{scenarioVariables.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="text-[11px] text-slate-400">Observe <select aria-label="Scenario target" value={target} onChange={e => setTarget(e.target.value)} className="block w-full bg-slate-900 border border-slate-700 rounded p-1 text-slate-100">{scenarioVariables.map(value => <option key={value}>{value}</option>)}</select></label></div>
            <label className="text-[11px] text-slate-400 block">Driver change: {changePercent}% <input aria-label="Driver percent change" type="range" min="-50" max="50" step="5" value={changePercent} onChange={e => setChangePercent(Number(e.target.value))} className="block w-full" /></label>
            <button onClick={runScenario} className="text-xs font-semibold rounded bg-cyan-700 hover:bg-cyan-600 px-3 py-2">Project relationship</button>
            {scenarioError && <p role="alert" className="text-xs text-rose-300">{scenarioError}</p>}
            {scenarioResult && <div className="text-xs bg-slate-900 rounded-lg p-3 space-y-1"><p className="font-bold text-cyan-200">{scenarioResult.label}</p><p>{scenarioResult.target}: {scenarioResult.baseline_target} → {scenarioResult.projected_target}</p><p>Observed r={scenarioResult.pearson ?? '—'} · {scenarioResult.sample_count} paired samples</p><p className="text-slate-400">{scenarioResult.limitations}</p></div>}
          </div>
        </>}
      </aside>
    </div>
    <div className="flex flex-wrap gap-3 items-center text-[11px] text-slate-400"><span className="font-semibold text-slate-300">Indian AQI bands:</span>{[['Good','#22c55e'],['Satisfactory','#84cc16'],['Moderate','#eab308'],['Poor','#f97316'],['Very poor','#ef4444'],['Severe','#7e22ce']].map(([label,color]) => <span key={label} className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{label}</span>)}</div>
    <p className="text-[11px] text-slate-500">Open-Meteo weather and CAMS air-quality model data; map tiles © OpenStreetMap contributors. Indian AQI values are estimated (model-based), not CPCB station readings. Indicative analysis, not policy guidance.</p>
  </section>;
}

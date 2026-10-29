'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api';
import type { MaharashtraDistrict } from './types';

type LayerItem = Record<string, string | number | null>;
const LAYERS = [
  { key: 'industry', title: 'MPCB industrial regions', note: 'MPCB regions are not districts. Counts remain at the source region level.' },
  { key: 'airports', title: 'Airport connectivity', note: 'Airport and section totals are not joined to districts.' },
  { key: 'vehicles', title: 'RTO vehicle composition', note: 'RTO office subtotals remain separate from district values.' },
] as const;
const COMPARE_METRICS = ['population_2011', 'density_2011', 'health_facilities_per_lakh', 'secondary_dropout_percent', 'per_capita_income_source_units', 'vehicles_per_lakh'];

export default function MaharashtraInsights({ districts }: { districts: MaharashtraDistrict[] }) {
  const [active, setActive] = useState<string>('industry');
  const [layers, setLayers] = useState<Record<string, LayerItem[]>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/maharashtra/layers/${active}`).then(r => { if (!r.ok) throw new Error(`Layer request failed (${r.status})`); return r.json(); })
      .then(data => { if (!cancelled) setLayers(previous => ({ ...previous, [active]: data.items })); }).catch(() => { if (!cancelled) setLayers(previous => ({ ...previous, [active]: [] })); });
    return () => { cancelled = true; };
  }, [active]);
  const selected = districts.filter(d => compareIds.includes(d.id));
  const label = (key: string) => key.replaceAll('_', ' ');
  return <section className="mah-insights" aria-label="Separate layers and district comparisons">
    <div className="mah-insights-grid">
      <section className="mah-ranked-panel mah-layer-panel"><p className="mah-eyebrow">SEPARATE SOURCE LAYERS</p><h2>Regional context</h2><div className="mah-layer-tabs" role="tablist" aria-label="Regional layers">{LAYERS.map(layer => <button type="button" role="tab" aria-selected={active === layer.key} key={layer.key} onClick={() => setActive(layer.key)}>{layer.title}</button>)}</div><p>{LAYERS.find(layer => layer.key === active)?.note}</p>
        <div className="mah-layer-list">{(layers[active] ?? []).slice(0, 20).map((item, i) => <article key={`${active}-${i}`}><strong>{String(item['MPCB region'] ?? item['Airport / grouping'] ?? item['Office / grouping cleaned'] ?? 'Source row')}</strong><span>{Object.entries(item).filter(([k, v]) => !['Row type', 'Notes', 'MPCB region', 'Airport / grouping', 'Office / grouping cleaned', 'Transport office / grouping (source)'].includes(k) && typeof v === 'number').slice(0, 3).map(([k,v]) => `${label(k)}: ${new Intl.NumberFormat('en-IN').format(v as number)}`).join(' · ')}</span></article>)}</div>
      </section>
      <section className="mah-ranked-panel mah-compare-panel"><p className="mah-eyebrow">COMPARE DISTRICTS</p><h2>Cross-district profile</h2><p>Choose up to three districts. Bars are rescaled within each metric for comparison; values remain descriptive and non-causal.</p>
        <label>Add district<select value="" onChange={event => { const id = event.target.value; if (id && compareIds.length < 3 && !compareIds.includes(id)) setCompareIds([...compareIds, id]); }}><option value="">Select district…</option>{districts.filter(d => !compareIds.includes(d.id)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <div className="mah-compare-districts">{selected.map(d => <button type="button" key={d.id} onClick={() => setCompareIds(compareIds.filter(id => id !== d.id))} aria-label={`Remove ${d.name} from comparison`}>{d.name} ×</button>)}</div>
        {selected.length > 0 && <div className="mah-compare-table"><div className="mah-compare-head"><span>Metric</span>{selected.map(d => <b key={d.id}>{d.name}</b>)}</div>{COMPARE_METRICS.map(metric => {
          const values = selected.map(d => typeof d.metrics[metric] === 'number' ? d.metrics[metric] as number : null);
          const max = Math.max(...values.filter((v): v is number => v !== null), 1);
          return <div className="mah-compare-row" key={metric}><span>{label(metric)}</span>{selected.map((d, i) => <div key={d.id}><small>{values[i] === null ? 'No data' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(values[i]!)}</small><i style={{ width: values[i] === null ? '0%' : `${Math.max(3, values[i]! / max * 100)}%` }} /></div>)}</div>;
        })}</div>}
      </section>
    </div>
  </section>;
}

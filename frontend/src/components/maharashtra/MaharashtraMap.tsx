'use client';

import { geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, GeoPermissibleObjects, Geometry } from 'geojson';
import { API_BASE } from '../../config/api';
import type { DistrictStatistic, FieldInfo, MaharashtraDistrict, MaharashtraGeo, MaharashtraMeta } from './types';

const PALETTE = ['#eff6ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'];
const METRIC_KEYS = [
  'population_2011', 'density_2011', 'literacy_2011_percent', 'population_growth_2001_11',
  'health_facilities_per_lakh', 'schools_per_10_sq_km', 'secondary_dropout_percent',
  'forest_land_percent', 'per_capita_income_source_units', 'domestic_electricity_kwh_per_capita',
  'industrial_electricity_kwh_per_capita', 'vehicles_per_lakh', 'underweight_severe_percent',
  'underweight_moderate_percent',
];
const GROUPS: Array<{ title: string; fields: string[] }> = [
  { title: 'Demographics', fields: ['population_2011', 'population_growth_2001_11', 'density_2011', 'literacy_2011_percent'] },
  { title: 'Health infrastructure', fields: ['health_sub_centres', 'primary_health_centres', 'dispensaries', 'sub_district_hospitals', 'district_hospitals', 'general_hospitals', 'women_hospitals', 'rural_hospitals', 'total_reported_health_facilities', 'health_facilities_per_lakh'] },
  { title: 'Education', fields: ['schools_per_10_sq_km', 'secondary_dropout_percent'] },
  { title: 'Economy and mobility', fields: ['per_capita_income_source_units', 'domestic_electricity_kwh_per_capita', 'industrial_electricity_kwh_per_capita', 'vehicles_per_lakh'] },
  { title: 'Land and nutrition', fields: ['forest_land_percent', 'underweight_severe_percent', 'underweight_moderate_percent'] },
];

function metricValue(district: MaharashtraDistrict, key: string): number | null {
  const value = district.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatValue(value: number | string | null | undefined, field: FieldInfo | undefined): string {
  if (value === null || value === undefined || value === '') return 'No data';
  if (typeof value === 'number') return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}${field?.unit && field.unit !== 'source units' && field.unit !== 'not specified' ? ` ${field.unit}` : ''}`;
  return String(value);
}

function colorAt(value: number | null, cuts: number[]): string {
  if (value === null) return 'url(#no-data-hatch)';
  if (!cuts.length) return PALETTE[2];
  const ratio = cuts[4] === cuts[0] ? 0.5 : (value - cuts[0]) / (cuts[4] - cuts[0]);
  return PALETTE[Math.max(0, Math.min(PALETTE.length - 1, Math.round(ratio * (PALETTE.length - 1))))];
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

function FieldRows({ district, meta }: { district: MaharashtraDistrict; meta: MaharashtraMeta }) {
  return <div className="mah-field-groups">
    {GROUPS.map(group => <section key={group.title} className="mah-field-group">
      <h4>{group.title}</h4>
      <div className="mah-field-list">{group.fields.map(key => {
        const field = meta.data_dictionary[key];
        const value = district.metrics[key];
        const statistic: DistrictStatistic | null = district.statistics[key] ?? null;
        const missingReason = !statistic && district.coverage_warning ? district.coverage_warning : 'No value was reported for this district.';
        const median = statistic?.state_median;
        const number = typeof value === 'number' ? value : null;
        const bar = number === null || median === undefined ? 0 : Math.max(3, Math.min(100, (Math.abs(number) / Math.max(Math.abs(number), Math.abs(median), 1)) * 100));
        return <div className="mah-stat-row" key={key}>
          <div className="mah-stat-main">
            <span>{field?.label ?? key.replaceAll('_', ' ')}</span>
            <strong>{formatValue(value, field)}</strong>
          </div>
          {statistic ? <div className="mah-stat-meta">
            <span>{statistic.rank_label} · {statistic.percentile.toFixed(0)}th percentile</span>
            <span>vs state median {formatValue(statistic.state_median, field)} · {statistic.difference_from_median >= 0 ? '+' : ''}{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(statistic.difference_from_median)}</span>
            <div className="mah-median-track" aria-label={`Value relative to state median ${statistic.state_median}`}><i style={{ width: `${bar}%` }} /></div>
          </div> : <small className="mah-no-data-reason">{missingReason}</small>}
        </div>;
      })}</div>
    </section>)}
    <section className="mah-field-group">
      <h4>Population by census year</h4>
      {district.census_series.length ? <div className="mah-sparkline" role="img" aria-label={`Population history for ${district.name}`}>
        {district.census_series.map(row => <span key={row.year}>
          <b>{row.population === null ? 'No data' : new Intl.NumberFormat('en-IN').format(row.population)}</b>
          <small>{row.year}{row.note ? ` · ${row.note}` : ''}</small>
        </span>)}
      </div> : <p className="mah-no-data-reason">No census series is available.</p>}
    </section>
  </div>;
}

function DistrictCard({ district, meta, onClose, pinned }: { district: MaharashtraDistrict; meta: MaharashtraMeta; onClose?: () => void; pinned: boolean }) {
  return <article className={`mah-district-card${pinned ? ' mah-district-card-pinned' : ''}`} aria-label={`${district.name} district statistics`}>
    <header><div><p className="mah-eyebrow">Maharashtra district</p><h3>{district.name}</h3></div>{onClose && <button type="button" className="mah-icon-button" onClick={onClose} aria-label="Close district details">×</button>}</header>
    {district.coverage_warning && <p className="mah-warning-chip">Coverage note · {district.coverage_warning}</p>}
    <p className="mah-reference-note">Reference years vary or are unspecified. Values are not assumed to share a year.</p>
    <FieldRows district={district} meta={meta} />
  </article>;
}

export default function MaharashtraMap() {
  const [districts, setDistricts] = useState<MaharashtraDistrict[]>([]);
  const [geo, setGeo] = useState<MaharashtraGeo | null>(null);
  const [meta, setMeta] = useState<MaharashtraMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState('population_2011');
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ width: 720, height: 540 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => setReducedMotion(prefersReducedMotion), [prefersReducedMotion]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${API_BASE}/api/maharashtra/districts`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(`District API ${r.status}`); return r.json(); }),
      fetch(`${API_BASE}/api/maharashtra/meta`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(`Metadata API ${r.status}`); return r.json(); }),
      fetch('/data/maharashtra-districts.geojson', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(`Boundary file ${r.status}`); return r.json(); }),
    ]).then(([districtData, metaData, geoData]) => {
      setDistricts(districtData.districts as MaharashtraDistrict[]);
      setMeta(metaData as MaharashtraMeta);
      setGeo(geoData as MaharashtraGeo);
      setError(null);
    }).catch((reason: Error) => { if (reason.name !== 'AbortError') setError(reason.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.max(320, Math.floor(entries[0]?.contentRect.width ?? 720));
      setSize({ width, height: width < 520 ? Math.max(360, Math.min(520, width * 1.12)) : Math.min(600, Math.max(450, width * 0.78)) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const byName = useMemo(() => new Map(districts.map(district => [district.name, district])), [districts]);
  const fieldInfo = meta?.data_dictionary[metric];
  const valid = districts.map(district => metricValue(district, metric)).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const cuts = valid.length ? [valid[0], valid[Math.floor((valid.length - 1) * .25)], valid[Math.floor((valid.length - 1) * .5)], valid[Math.floor((valid.length - 1) * .75)], valid.at(-1)!] : [];
  const projection = useMemo(() => geo ? geoMercator().fitSize([size.width - 28, size.height - 24], geo as GeoPermissibleObjects) : null, [geo, size]);
  const path = useMemo(() => projection ? geoPath(projection) : null, [projection]);
  const entries = useMemo(() => geo?.features.map(feature => {
    const d = byName.get(feature.properties.name);
    const centroid = projection ? projection(geoCentroid(feature as Feature<Geometry>)) : null;
    return { feature, district: d, centroid };
  }).filter(item => item.district) ?? [], [geo, byName, projection]);
  const ordered = useMemo(() => [...entries].sort((a, b) => Number(a.district?.name === hovered) - Number(b.district?.name === hovered)), [entries, hovered]);
  const hoveredDistrict = hovered ? byName.get(hovered) ?? null : null;
  const selectedDistrict = selected ? byName.get(selected) ?? null : null;
  const searchResults = districts.filter(district => district.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const ranked = [...districts].filter(district => metricValue(district, metric) !== null)
    .sort((a, b) => (metricValue(b, metric) ?? -Infinity) - (metricValue(a, metric) ?? -Infinity)).slice(0, 10);

  const setFocus = useCallback((name: string, pin = false) => {
    setHovered(name);
    if (pin) setSelected(name);
  }, []);

  const onMapKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const districtNames = entries.map(item => item.district!.name);
    if (event.key === 'Escape') { setHovered(null); setSelected(null); return; }
    const current = (event.target as SVGPathElement).dataset.district;
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key) && current) {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = (districtNames.indexOf(current) + direction + districtNames.length) % districtNames.length;
      pathRefs.current[districtNames[next]]?.focus();
      setFocus(districtNames[next]);
    }
    if ((event.key === 'Enter' || event.key === ' ') && current) { event.preventDefault(); setFocus(current, true); }
  };

  if (error) return <section className="mah-page"><div className="mah-error"><h1>Maharashtra module unavailable</h1><p>{error}. Confirm that the NexusData backend and bundled boundary data are available.</p></div></section>;
  if (!geo || !meta || !districts.length || !path) return <section className="mah-page"><div className="mah-loading" aria-live="polite">Loading 36 Maharashtra districts and source notes…</div></section>;

  return <main className="mah-page">
    <header className="mah-page-header"><div><p className="mah-eyebrow">NEXUSDATA · STATE ATLAS</p><h1>Maharashtra, district by district</h1><p>{meta.temporal_scope}</p></div><div className="mah-header-count"><strong>36</strong><span>districts · 1 snapshot</span></div></header>
    <div className="mah-data-banner"><b>Analysis-ready, not year-aligned.</b> This user-supplied workbook has not been independently authenticated. Blank values are unknown, never zero. Open <button type="button" onClick={() => document.getElementById('maharashtra-data-notes')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' })}>Data notes</button> for coverage rules.</div>

    <section className="mah-controls" aria-label="Map controls">
      <label>Color districts by<select value={metric} onChange={event => setMetric(event.target.value)} aria-label="Maharashtra map metric">
        {METRIC_KEYS.map(key => <option key={key} value={key}>{meta.data_dictionary[key]?.label ?? key}</option>)}
      </select></label>
      <label className="mah-search-label">Find district<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by district name" aria-label="Search Maharashtra districts" />
        {!!search && <div className="mah-search-results" role="listbox">{searchResults.map(district => <button key={district.id} type="button" role="option" onMouseEnter={() => setFocus(district.name)} onClick={() => { setSelected(district.name); setHovered(district.name); setSearch(''); }}>{district.name}</button>)}</div>}
      </label>
      <p className="mah-data-label">{valid.length} of 36 districts have data · reference years vary / unspecified</p>
    </section>

    <div className="mah-map-layout" onMouseLeave={() => { if (!selected) setHovered(null); }}>
      <section className="mah-map-panel" aria-label="Maharashtra district map">
        <div className="mah-map-title"><div><p className="mah-eyebrow">DISTRICT CHOROPLETH</p><h2>{fieldInfo?.label ?? 'District map'}</h2></div>
          {selectedDistrict && <button className="mah-clear-selection" type="button" onClick={() => setSelected(null)}>Clear pinned district</button>}
        </div>
        <div className="mah-map-stage" ref={hostRef}>
          <svg ref={svgRef} width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="Map of Maharashtra districts" onKeyDown={onMapKeyDown} onMouseMove={event => {
            const rect = hostRef.current?.getBoundingClientRect();
            if (rect) setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          }}>
            <defs><pattern id="no-data-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="#e7edf2" /><line x1="0" y1="0" x2="0" y2="7" stroke="#7f8c99" strokeWidth="2" /></pattern></defs>
            <g transform="translate(14,12)">{ordered.map(({ feature, district, centroid }) => {
              const name = district!.name;
              const value = metricValue(district!, metric);
              const isHovered = hovered === name;
              const reducedTransform = !reducedMotion && isHovered && centroid ? `translate(${centroid[0]} ${centroid[1]}) scale(1.05) translate(${-centroid[0]} ${-centroid[1]})` : undefined;
              return <path key={district!.id} ref={node => { pathRefs.current[name] = node; }} data-district={name} d={path(feature as GeoPermissibleObjects) ?? undefined}
                className={`mah-district-shape${isHovered ? ' is-hovered' : ''}${selected === name ? ' is-selected' : ''}`}
                fill={colorAt(value, cuts)} stroke={isHovered || selected === name ? '#0d2438' : '#fff'} strokeWidth={isHovered ? 2.5 : 1.1}
                transform={reducedTransform} style={{ opacity: hovered && !isHovered ? 0.55 : 1, filter: isHovered && !reducedMotion ? 'drop-shadow(0 5px 5px rgb(11 32 52 / 42%))' : undefined, transitionDuration: reducedMotion ? '0ms' : '180ms' }}
                tabIndex={0} role="button" aria-label={`${name}. ${fieldInfo?.label ?? metric}: ${formatValue(value, fieldInfo)}. Press Enter to pin details.`}
                onFocus={() => setFocus(name)} onBlur={() => { if (!selected) setHovered(null); }} onMouseEnter={() => setFocus(name)} onClick={() => { setSelected(name); setHovered(name); }}
                onKeyDown={event => { if (event.key === 'Escape') { setSelected(null); setHovered(null); } }}>
                <title>{name} · {fieldInfo?.label ?? metric}: {formatValue(value, fieldInfo)}</title>
              </path>;
            })}</g>
          </svg>
          {hoveredDistrict && !selectedDistrict && <div className="mah-hover-card" style={{ left: Math.max(8, Math.min(cursor.x + 14, size.width - 370)), top: Math.max(8, Math.min(cursor.y + 12, size.height - 470)) }}>
            <DistrictCard district={hoveredDistrict} meta={meta} pinned={false} />
          </div>}
        </div>
        <div className="mah-legend"><div><strong>{fieldInfo?.label ?? metric}</strong><span>{fieldInfo?.unit ?? ''}</span></div><div className="mah-legend-scale"><div className="mah-color-ramp" aria-hidden="true">{PALETTE.map(color => <i key={color} style={{ background: color }} />)}</div><div className="mah-legend-values"><span>Min {formatValue(cuts[0], fieldInfo)}</span><span>Median {formatValue(cuts[2], fieldInfo)}</span><span>Max {formatValue(cuts.at(-1), fieldInfo)}</span></div><small>Hatched fill = no data</small></div></div>
      </section>
      <aside className="mah-ranked-panel"><div><p className="mah-eyebrow">DISTRICT RANKING</p><h2>Highest reported values</h2><p>Ranked among districts with data; high value is rank 1.</p></div>
        <ol>{ranked.map((district, index) => <li key={district.id} className={hovered === district.name || selected === district.name ? 'is-active' : ''} onMouseEnter={() => setFocus(district.name)} onMouseLeave={() => { if (!selected) setHovered(null); }}>
          <button type="button" onFocus={() => setFocus(district.name)} onBlur={() => { if (!selected) setHovered(null); }} onClick={() => { setSelected(district.name); setHovered(district.name); }}><span className="mah-rank-number">{String(index + 1).padStart(2, '0')}</span><span>{district.name}</span><strong>{formatValue(metricValue(district, metric), fieldInfo)}</strong></button>
        </li>)}</ol>
      </aside>
    </div>

    {selectedDistrict && <DistrictCard district={selectedDistrict} meta={meta} pinned onClose={() => { setSelected(null); setHovered(null); }} />}
  </main>;
}

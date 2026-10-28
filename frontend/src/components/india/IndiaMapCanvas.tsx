'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import type { LiveCity, Metric, FocusArea } from './types';
import { metricColor, metricValue, stateAverages } from './mapUtils';

interface Props { cities: LiveCity[]; metric: Metric; selected: string | null; focus: FocusArea | 'all'; choropleth: boolean; onSelect: (name: string) => void }

export default function IndiaMapCanvas({ cities, metric, selected, focus, choropleth, onSelect }: Props) {
  const [boundaries, setBoundaries] = useState<FeatureCollection | null>(null);
  useEffect(() => { fetch('/data/india_states.geojson').then(r => r.json()).then(setBoundaries).catch(() => setBoundaries(null)); }, []);
  const averages = useMemo(() => stateAverages(cities, metric), [cities, metric]);
  const visible = cities.filter(city => focus === 'all' || city.development?.focus_areas.some(area => area.area === focus));
  return <MapContainer center={[22.8, 79.2]} zoom={5} minZoom={4} maxZoom={13} scrollWheelZoom={false} className="h-[480px] md:h-[630px] w-full rounded-2xl z-0">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {boundaries && <GeoJSON key={`${metric}-${choropleth}`} data={boundaries} style={feature => {
      const state = String(feature?.properties?.name ?? '');
      return { color: '#94a3b8', weight: 1, fillColor: choropleth ? metricColor(metric, averages[state] ?? null) : '#0f172a', fillOpacity: choropleth ? .42 : .08 };
    }} onEachFeature={(feature, layer) => {
      const name = String(feature.properties?.name ?? 'State');
      layer.bindTooltip(`${name}: ${averages[name] === undefined ? 'No city data' : averages[name].toFixed(1)}`);
    }} />}
    {visible.map(city => {
      const value = metricValue(city, metric);
      return <CircleMarker key={city.name} center={[city.lat, city.lon]} radius={selected === city.name ? 14 : value === null ? 6 : 7 + Math.min(Math.abs(value) / (metric === 'aqi' ? 50 : 25), 7)}
        pathOptions={{ color: selected === city.name ? '#fff' : '#0f172a', weight: selected === city.name ? 3 : 1.5, fillColor: metricColor(metric, value), fillOpacity: .9 }}
        eventHandlers={{ click: () => onSelect(city.name) }}>
        <Tooltip>{city.name} · {value === null ? 'No data' : value.toFixed(1)}</Tooltip>
      </CircleMarker>;
    })}
  </MapContainer>;
}

import type { LiveCity, Metric } from './types';

export const METRIC_LABELS: Record<Metric, string> = {
  aqi: 'Indian AQI — estimated (model-based)', pm25: 'PM2.5 (µg/m³)', temperature: 'Temperature (°C)',
  humidity: 'Humidity (%)', load_MW: 'Electricity load (MW)',
};

export function metricValue(city: LiveCity, metric: Metric): number | null {
  const value = city.current?.metrics?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function metricColor(metric: Metric, value: number | null): string {
  if (value === null) return '#64748b';
  if (metric === 'aqi') {
    if (value <= 50) return '#22c55e';
    if (value <= 100) return '#84cc16';
    if (value <= 200) return '#eab308';
    if (value <= 300) return '#f97316';
    if (value <= 400) return '#ef4444';
    return '#7e22ce';
  }
  if (metric === 'pm25') return value < 30 ? '#22c55e' : value < 60 ? '#eab308' : '#ef4444';
  if (metric === 'temperature') return value < 30 ? '#38bdf8' : value < 38 ? '#f59e0b' : '#ef4444';
  if (metric === 'humidity') return value < 35 ? '#eab308' : value < 75 ? '#22c55e' : '#38bdf8';
  return value < 1000 ? '#22c55e' : value < 3000 ? '#eab308' : '#ef4444';
}

export function stateAverages(cities: LiveCity[], metric: Metric): Record<string, number> {
  const groups: Record<string, number[]> = {};
  for (const city of cities) {
    const value = metricValue(city, metric);
    if (value !== null) (groups[city.state] ??= []).push(value);
  }
  return Object.fromEntries(Object.entries(groups).map(([state, values]) => [state, values.reduce((a, b) => a + b, 0) / values.length]));
}

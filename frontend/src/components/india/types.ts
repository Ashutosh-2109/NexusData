export type Metric = 'aqi' | 'pm25' | 'temperature' | 'humidity' | 'load_MW';
export type FocusArea = 'Air Quality' | 'Heat Stress' | 'Energy Demand';

export interface LivePoint {
  time: string;
  city: string;
  metrics: Record<string, number | null>;
  source: string;
  fetched_at: string;
  data_quality: 'station' | 'model' | 'provisional';
}

export interface LiveCity {
  name: string;
  state: string;
  lat: number;
  lon: number;
  population: number;
  area_km2: number;
  aliases: string[];
  current: LivePoint | null;
  stale: boolean;
  development?: {score: number | null; focus_areas: Array<{area: FocusArea; severity: string}>};
}

export interface LiveSnapshot {
  cities: LiveCity[];
  last_refresh: string | null;
  error: string | null;
  status: 'live' | 'stale' | 'offline';
}

export interface CityDetail {
  city: LiveCity;
  current: LivePoint | null;
  history: LivePoint[];
  station_observations: LivePoint[];
  stale: boolean;
  relationships: Array<{variable_a: string; variable_b: string; pearson: number | null; sample_count: number}>;
  development?: {score: number | null; focus_areas: Array<{area: FocusArea; severity: string}>; suggestions: Array<{
    action: string; focus_area: string; evidence: string[]; rule_id: string; expected_direction: string;
    confidence: string; limitations: string;
  }>};
}

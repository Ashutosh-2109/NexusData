import type { FeatureCollection, Geometry } from 'geojson';

export interface DistrictStatistic {
  rank: number;
  rank_label: string;
  districts_with_data: number;
  percentile: number;
  state_median: number;
  difference_from_median: number;
}

export interface MaharashtraDistrict {
  id: string;
  name: string;
  metrics: Record<string, number | string | null>;
  statistics: Record<string, DistrictStatistic | null>;
  coverage_warning: string | null;
  census_series: Array<{ year: number; population: number | null; literacy_percent: number | null; density_per_km2: number | null; source_district: string; note: string | null }>;
}

export interface FieldInfo { label: string; unit: string; source_sheet: string; caveat: string }
export interface MaharashtraMeta {
  district_count: number;
  temporal_scope: string;
  source_note: string;
  counts: Record<string, number>;
  data_dictionary: Record<string, FieldInfo>;
  quality_summary: Array<Record<string, string | number>>;
  quality_rules: Array<Record<string, string | null>>;
}
export type MaharashtraGeo = FeatureCollection<Geometry, { id: string; name: string; source_name: string; soi_district_code: string; state_lgd_code: string }>;

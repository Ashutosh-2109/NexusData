import { describe, expect, it } from 'vitest';
import { metricColor, stateAverages } from './mapUtils';
import type { LiveCity } from './types';

describe('India map metrics', () => {
  it('uses Indian AQI colour bands and neutral missing values', () => {
    expect(metricColor('aqi', 50)).toBe('#22c55e');
    expect(metricColor('aqi', 201)).toBe('#f97316');
    expect(metricColor('aqi', 450)).toBe('#7e22ce');
    expect(metricColor('aqi', null)).toBe('#64748b');
  });

  it('averages only cities with observations', () => {
    const cities = [50, 100, null].map((value, index) => ({name: `C${index}`, state: 'Test', current: value === null ? null : {metrics: {aqi: value}}})) as LiveCity[];
    expect(stateAverages(cities, 'aqi').Test).toBe(75);
  });
});

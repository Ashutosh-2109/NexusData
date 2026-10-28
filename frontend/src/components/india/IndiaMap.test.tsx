import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LiveSnapshot } from './types';

const snapshot: LiveSnapshot = {last_refresh: '2026-01-01T00:00:00Z', error: null, status: 'live', cities: [{
  name: 'Mumbai', state: 'Maharashtra', lat: 19, lon: 72, population: 1000000, area_km2: 100,
  aliases: [], stale: false, current: {time: '2026-01-01T00:00:00Z', city: 'Mumbai', metrics: {aqi: 120, pm25: 42, temperature: 32, humidity: 60}, source: 'Open-Meteo', fetched_at: '2026-01-01T00:00:00Z', data_quality: 'model'},
  development: {score: 45, focus_areas: [{area: 'Air Quality', severity: 'moderate'}]}
}]};

vi.mock('./useLiveCities', () => ({useLiveCities: () => ({snapshot, status: 'live', error: null})}));
vi.mock('next/dynamic', () => ({default: () => ({onSelect}: {onSelect: (name: string) => void}) => <button onClick={() => onSelect('Mumbai')}>Mumbai marker</button>}));

import IndiaMap from './IndiaMap';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('India map panel', () => {
  it('shows live state, metric controls, and city evidence', async () => {
    const detail = {city: snapshot.cities[0], current: snapshot.cities[0].current, history: [], station_observations: [], stale: false,
      relationships: [], development: {score: 45, focus_areas: [{area: 'Air Quality', severity: 'moderate'}], suggestions: [{action: 'Compare model with station', focus_area: 'Air Quality', evidence: ['PM2.5: 42'], rule_id: 'aq-monitor-1', expected_direction: 'Better evidence', confidence: 'moderate', limitations: 'Model data'}]}};
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, json: async () => detail}));
    render(<IndiaMap />);
    expect(screen.getByRole('status').textContent).toBe('live');
    expect(screen.getByLabelText('Map metric')).toBeTruthy();
    fireEvent.click(screen.getByText('Mumbai marker'));
    await waitFor(() => expect(screen.getByText('Compare model with station')).toBeTruthy());
    expect(screen.getByText(/PM2.5: 42/)).toBeTruthy();
    expect(screen.getByText(/Limitations: Model data/)).toBeTruthy();
  });
});

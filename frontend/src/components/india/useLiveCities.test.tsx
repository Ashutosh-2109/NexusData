import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useLiveCities } from './useLiveCities';

class FakeEventSource extends EventTarget {
  static latest: FakeEventSource;
  closed = false;
  onerror: (() => void) | null = null;
  constructor() { super(); FakeEventSource.latest = this; }
  close() { this.closed = true; }
  snapshot(data: object) { this.dispatchEvent(new MessageEvent('snapshot', {data: JSON.stringify(data)})); }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('live stream hook', () => {
  it('loads initially, applies SSE snapshots, marks disconnect stale, and closes', async () => {
    const initial = {cities: [], last_refresh: null, error: null, status: 'offline'};
    const next = {cities: [{name: 'Mumbai'}], last_refresh: '2026-01-01T00:00:00Z', error: null, status: 'live'};
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, json: async () => initial}));
    vi.stubGlobal('EventSource', FakeEventSource);
    const {result, unmount} = renderHook(() => useLiveCities());
    await waitFor(() => expect(result.current.status).toBe('offline'));
    act(() => FakeEventSource.latest.snapshot(next));
    expect(result.current.status).toBe('live');
    expect(result.current.snapshot?.cities).toHaveLength(1);
    act(() => FakeEventSource.latest.onerror?.());
    expect(result.current.status).toBe('stale');
    unmount();
    expect(FakeEventSource.latest.closed).toBe(true);
  });
});

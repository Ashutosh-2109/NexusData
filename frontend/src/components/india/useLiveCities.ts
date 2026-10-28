'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '../../config/api';
import type { LiveSnapshot } from './types';

export function useLiveCities() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'stale' | 'offline'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/live/cities`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`Live API returned ${response.status}`); return response.json(); })
      .then((data: LiveSnapshot) => { if (mounted) { setSnapshot(data); setStatus(data.status); setError(data.error); } })
      .catch((reason: Error) => { if (mounted && reason.name !== 'AbortError') { setError(reason.message); setStatus('offline'); } });
    const stream = new EventSource(`${API_BASE}/api/live/stream`);
    stream.addEventListener('snapshot', (event) => {
      if (!mounted) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as LiveSnapshot;
        setSnapshot(data); setStatus(data.status); setError(data.error);
      } catch { setError('Invalid live update'); }
    });
    stream.onerror = () => { if (mounted) setStatus((current) => current === 'loading' ? 'offline' : 'stale'); };
    return () => { mounted = false; controller.abort(); stream.close(); };
  }, []);

  return { snapshot, status, error };
}

import { dispatcherApiUrl } from './api-url.js';
export function createArrivalSession() {
  const seen = new Set();
  let initialized = false;
  return {
    unseen(items) {
      if (!Array.isArray(items)) throw new TypeError('Invalid event list');
      // First successful snapshot is history, irrespective of server/client clocks.
      if (!initialized) {
        for (const item of items) {
          if (typeof item?.id === 'string' && item.id) seen.add(item.id);
        }
        initialized = true;
        return [];
      }
      const batch = new Set();
      return items.filter(item => {
        if (typeof item?.id !== 'string' || !item.id ||
            !Number.isFinite(Date.parse(item.arrivedAt)) ||
            seen.has(item.id) || batch.has(item.id)) return false;
        batch.add(item.id);
        return true;
      });
    },
    markSeen(id) { seen.add(id); },
  };
}

export function subscribeToArrivals({ onArrival, onConnectionChange, interval = 2000 }) {
  const url = dispatcherApiUrl('/api/arrivals');
  let stopped = false;
  let timer;
  let controller;
  const session = createArrivalSession();
  async function poll() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Arrival connection failed');
      const { items } = await response.json();
      if (!Array.isArray(items)) throw new Error('Invalid arrivals');
      if (stopped) return;
      for (const item of session.unseen(items)) {
        onArrival(item);
        session.markSeen(item.id);
      }
      onConnectionChange?.(true);
    } catch { if (!stopped) onConnectionChange?.(false); }
    finally { clearTimeout(timeout); if (!stopped) timer = setTimeout(poll, interval); }
  }
  poll();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}


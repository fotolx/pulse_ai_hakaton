import { dispatcherApiUrl } from './api-url.js';
// Only events received by the bridge after this page was opened belong to this session.
// Use receivedAt, not the phone's clock (arrivedAt), to include delayed deliveries.
export function createArrivalSession(startedAt = Date.now()) {
  const seen = new Set();
  return {
    unseen(items) {
      return items.filter(item => typeof item.id === 'string' &&
        Number.isFinite(Date.parse(item.arrivedAt)) &&
        Date.parse(item.receivedAt) >= startedAt && !seen.has(item.id));
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
      const response = await fetch(url, { signal: controller.signal });
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


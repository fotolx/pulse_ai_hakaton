import { dispatcherApiUrl } from './api-url.js';

export function createTaskSession(startedAt = Date.now()) {
  const seen = new Set();
  return {
    unseen(items) {
      return items.filter(item => typeof item.id === 'string' &&
        Number.isFinite(Date.parse(item.closedAt)) &&
        Date.parse(item.receivedAt) >= startedAt && !seen.has(item.id));
    },
    markSeen(id) { seen.add(id); },
  };
}

export function subscribeToTasks({ onTask, interval = 2000 }) {
  const url = dispatcherApiUrl('/api/tasks');
  let stopped = false;
  let timer;
  let controller;
  const session = createTaskSession();
  async function poll() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Tasks connection failed');
      const { items } = await response.json();
      if (!Array.isArray(items)) throw new Error('Invalid tasks response');
      if (stopped) return;
      for (const item of session.unseen(items)) {
        onTask(item);
        session.markSeen(item.id);
      }
    } catch { /* connection handled by arrival service or silent */ }
    finally { clearTimeout(timeout); if (!stopped) timer = setTimeout(poll, interval); }
  }
  poll();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}


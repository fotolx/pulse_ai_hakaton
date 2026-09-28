import { dispatcherApiUrl } from './api-url.js';

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function normalizeEvents(data) {
  if (!data || !Array.isArray(data.items)) throw new TypeError('Некорректный ответ журнала');
  const unique = new Map();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || !item.id || !Number.isFinite(Date.parse(item.occurredAt))) throw new TypeError('Некорректное событие');
    for (const key of ['type', 'description', 'source', 'status']) {
      if (typeof item[key] !== 'string') throw new TypeError('Некорректное событие');
    }
    const date = new Date(item.occurredAt);
    unique.set(item.id, { ...item, picket: String(item.picketId ?? ''), collector: String(item.collector ?? ''), district: String(item.district ?? ''), okrug: String(item.okrug ?? ''), date: dateFormat.format(date), time: timeFormat.format(date) });
  }
  const items = [...unique.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return { items, total: Number.isInteger(data.total) && data.total >= items.length ? data.total : items.length };
}

export function createEventsService({ fetcher = globalThis.fetch, url = () => dispatcherApiUrl('/api/events') } = {}) {
  return {
    async list(filters = {}, { signal } = {}) {
      const target = new URL(url());
      for (const key of ['from', 'to', 'type', 'status', 'q']) {
        if (filters[key]) target.searchParams.set(key, filters[key]);
      }
      target.searchParams.set('limit', '500');
      const response = await fetcher(target, { signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Журнал событий: HTTP ${response.status}`);
      return normalizeEvents(await response.json());
    },
  };
}

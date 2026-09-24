import { createDemoNotifications } from '../data/notifications.js';

export function normalizeNotifications(items) {
  if (!Array.isArray(items)) throw new Error('Некорректный список уведомлений');
  const unique = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' ||
      typeof item.description !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
      (item.readAt != null && !Number.isFinite(Date.parse(item.readAt)))) throw new Error('Некорректное уведомление');
    unique.set(item.id, { id: item.id, title: item.title, description: item.description,
      createdAt: item.createdAt, readAt: item.readAt ?? null,
      severity: ['warning', 'info'].includes(item.severity) ? item.severity : 'danger' });
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function createDemoNotificationsService() {
  let items = createDemoNotifications();
  return {
    upsert(next) {
      const validated = normalizeNotifications(next);
      let changed = false;
      for (const item of validated) {
        const existing = items.find(value => value.id === item.id);
        const merged = { ...item, readAt: existing?.readAt ?? item.readAt };
        if (JSON.stringify(existing) === JSON.stringify(merged)) continue;
        items = items.filter(value => value.id !== item.id);
        items.push(merged);
        changed = true;
      }
      items = normalizeNotifications(items);
      return changed;
    },
    snapshot() { return items.map(item => ({ ...item })); },
    async list() { return items.map(item => ({ ...item })); },
    async markRead(ids) {
      const readAt = new Date().toISOString();
      items = items.map(item => ids.includes(item.id) && !item.readAt ? { ...item, readAt } : item);
      return { ids, readAt };
    },
  };
}

// Предлагаемый контракт API; включается после согласования маршрутов с бэкендом.
export function createHttpNotificationsService(baseUrl = '/api/notifications') {
  return {
    async list({ signal } = {}) {
      const response = await fetch(baseUrl, { signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Notifications: ${response.status}`);
      const data = await response.json();
      return normalizeNotifications(data.items);
    },
    async markRead(ids, { signal } = {}) {
      const response = await fetch(`${baseUrl}/read`, {
        method: 'POST', signal, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error(`Notifications: ${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result.ids) || !result.ids.every(id => ids.includes(id)) || !Number.isFinite(Date.parse(result.readAt))) throw new Error('Некорректное подтверждение прочтения');
      return result;
    },
  };
}

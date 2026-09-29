import { normalizeServerEventTime } from './server-event-time.js';

export function taskNotification(item) {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'medium' });
  const createdAt = normalizeServerEventTime(item.closedAt || new Date().toISOString());
  const sensorLabels = {
    door: 'КД Дверь',
    smoke: 'Датчик дыма',
    temp: 'Температура',
    motion: 'Датчик движения',
    gas: 'Газовый датчик',
    ups: 'ИБП',
  };
  const statuses = Object.entries(item.statusMap || {})
    .map(([k, v]) => `${sensorLabels[k] || k}: ${v === 'norm' ? 'НОРМА' : 'НЕИСПРАВЕН'}`)
    .join(', ');
  const photoCount = Array.isArray(item.photos) ? item.photos.length : 0;
  const commentText = item.comment ? `\nКомментарий: ${item.comment}` : '';
  const photosText = photoCount > 0 ? `\nФото: ${photoCount} шт.` : '';
  const statusLine = statuses ? `\nКонтроль: ${statuses}` : '';

  return {
    id: `task:${item.id}`,
    title: `Задача закрыта: ${item.nodeName || '№ 107'}`,
    description: `${item.technicianName} · ${item.position}\n${item.nodeName} · ${item.district}\nРаботы: ${item.task}${statusLine}${commentText}${photosText}\nЗакрыто: ${date.format(new Date(createdAt))} (МСК)`,
    createdAt,
    severity: 'info',
    readAt: null,
  };
}

import { normalizeServerEventTime } from './server-event-time.js';

export function arrivalNotification(item) {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'medium' });
  const createdAt = normalizeServerEventTime(item.arrivedAt);
  return {
    id: `arrival:${item.id}`,
    title: 'Специалист прибыл на узел',
    description: `${item.technicianName} · ${item.position}\n${item.nodeName} · ${item.district}\nРаботы: ${item.task}\nПрибытие: ${date.format(new Date(createdAt))} (МСК)`,
    createdAt,
    severity: 'info',
    readAt: null,
  };
}

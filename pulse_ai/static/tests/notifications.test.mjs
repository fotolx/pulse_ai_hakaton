import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNotifications, createDemoNotificationsService, createHttpNotificationsService } from '../js/services/notifications.js';
import { arrivalNotification } from '../js/services/arrival-notification.js';

test('arrivals remain in the page session but do not survive recreation', async () => {
  const service = createDemoNotificationsService();
  const item = arrivalNotification({ id: 'test-1', technicianName: 'Сидоров П.', position: 'Техник', nodeName: 'Узел 107', district: 'Первомайский', task: 'Плановое ТО', arrivedAt: '2026-09-20T12:00:00Z' });
  assert.match(item.description, /Сидоров П\.[\s\S]*Техник[\s\S]*Узел 107[\s\S]*Плановое ТО[\s\S]*15:00:00/);
  assert.equal(service.upsert([item]), true);
  assert.equal(service.upsert([item]), false);
  assert.equal((await service.list()).find(value => value.id === item.id).readAt, null);
  await service.markRead([item.id]);
  assert.equal(service.upsert([item]), false);
  const current = await service.list();
  assert.equal(current.filter(value => value.id === item.id).length, 1);
  assert.ok(current.find(value => value.id === item.id).readAt);
  assert.equal(current.find(value => value.id === item.id).severity, 'info');
  const restored = await createDemoNotificationsService().list();
  assert.equal(restored.some(value => value.id === item.id), false);
});

test('normalization sorts, deduplicates and rejects malformed backend data', () => {
  const item = { id: 'a', title: 'Узел', description: 'Тревога', createdAt: '2026-09-20T10:00:00Z', readAt: null };
  const result = normalizeNotifications([item, { ...item, title: 'Обновлено' }, { ...item, id: 'b', createdAt: '2026-09-20T11:00:00Z' }]);
  assert.deepEqual(result.map(value => value.id), ['b', 'a']);
  assert.equal(result[1].title, 'Обновлено');
  assert.throws(() => normalizeNotifications([{ ...item, createdAt: 'invalid' }]));
  assert.throws(() => normalizeNotifications({ items: [] }));
});

test('marking a snapshot read leaves later/unselected notifications unread', async () => {
  const service = createDemoNotificationsService();
  const original = await service.list();
  await service.markRead([original[0].id]);
  const updated = await service.list();
  assert.ok(updated[0].readAt);
  assert.equal(updated.filter(item => !item.readAt).length, 8);
  original[1].title = 'External mutation';
  assert.notEqual((await service.list())[1].title, 'External mutation');
});

test('HTTP adapter sends explicit ids and rejects failed requests', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ids: ['a'], readAt: '2026-09-20T10:00:00Z' }), { status: 200 });
  });
  const service = createHttpNotificationsService('/api/notifications');
  const result = await service.markRead(['a']);
  assert.deepEqual(result.ids, ['a']);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { ids: ['a'] });
  globalThis.fetch.mock.mockImplementation(async () => new Response('', { status: 503 }));
  await assert.rejects(service.list(), /503/);
});

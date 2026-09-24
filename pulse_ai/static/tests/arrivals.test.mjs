import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArrivalServer } from '../scripts/arrival-server.mjs';

test('arrival delivery validates, deduplicates, persists and handles simultaneous requests', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'collector-arrivals-'));
  const file = path.join(dir, 'arrivals.json');
  let server;
  async function start() {
    server = await createArrivalServer({ file });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}/api/arrivals`;
  }
  const stop = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  t.after(async () => { await stop(); await rm(dir, { recursive: true, force: true }); });
  let url = await start();
  const event = { id: 'test-arrival-001', technicianName: 'Тестовый Мастер', position: 'Техник', nodeId: '107', nodeName: 'Узел 107', district: 'Первомайский', task: 'Плановое ТО', arrivedAt: '2026-09-20T12:00:00.000Z' };
  const post = data => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post({})).status, 400);
  const responses = await Promise.all([post(event), post(event), post({ ...event, id: 'test-arrival-002' })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201, 201]);
  assert.equal((await post({ ...event, task: 'Changed' })).status, 409);
  assert.equal((await fetch(url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const response = await fetch(url, { headers: { Origin: 'http://127.0.0.1:5500' } });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5500');
  assert.equal((await response.json()).items.length, 2);
  await stop();
  url = await start();
  assert.equal((await (await fetch(url)).json()).items.length, 2);
  assert.equal((await post(event)).status, 200);
});

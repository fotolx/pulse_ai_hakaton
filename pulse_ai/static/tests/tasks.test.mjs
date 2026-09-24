import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createArrivalServer, validateTask } from '../scripts/arrival-server.mjs';

test('task delivery validates, deduplicates, persists and stores photo and checklist data', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'collector-tasks-test-'));
  const arrivalsFile = path.join(dir, 'arrivals.json');
  const tasksFile = path.join(dir, 'tasks.json');
  const server = await createArrivalServer({ file: arrivalsFile, tasksFile });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/api/tasks`;

  try {
    const validTask = {
      id: 'task-107-test-123456',
      technicianName: 'Иванов Иван',
      position: 'Техник',
      nodeId: '107',
      nodeName: '№ 107',
      district: 'Первомайский',
      task: 'Плановое ТО',
      statusMap: { door: 'norm', smoke: 'norm', temp: 'norm', motion: 'norm', gas: 'norm', ups: 'fault' },
      checklist: [
        { id: 'door', label: 'КД Дверь', status: 'norm' },
        { id: 'ups', label: 'ИБП', status: 'fault' },
      ],
      comment: 'ИБП требует замены батареи',
      photos: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'],
      closedAt: '2026-09-23T10:30:00.000Z',
    };

    // 1. Submit valid task
    const postRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTask),
    });
    assert.equal(postRes.status, 201);
    const postJson = await postRes.json();
    assert.equal(postJson.item.id, validTask.id);
    assert.equal(postJson.item.comment, validTask.comment);
    assert.equal(postJson.item.photos.length, 1);
    assert.ok(postJson.item.receivedAt);

    // 2. Fetch tasks list
    const getRes = await fetch(url);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.items.length, 1);
    assert.equal(getJson.items[0].id, validTask.id);

    // 3. Idempotent retry with identical data returns 200
    const retryRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTask),
    });
    assert.equal(retryRes.status, 200);

    // 4. Persistence on disk
    const onDisk = JSON.parse(await readFile(tasksFile, 'utf8'));
    assert.equal(onDisk.length, 1);
    assert.equal(onDisk[0].id, validTask.id);

    // 5. Validation failure for missing fields
    assert.throws(() => validateTask({ id: '123' }), /Invalid/);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

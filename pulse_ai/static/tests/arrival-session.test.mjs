import test from 'node:test';
import assert from 'node:assert/strict';
import { createArrivalSession } from '../js/services/arrivals.js';

test('reload excludes historical arrivals and reconnect retains new deliveries', () => {
  const start = Date.parse('2026-09-20T12:00:00Z');
  const event = (id, offset) => ({ id, arrivedAt: '2026-09-20T11:00:00Z', receivedAt: new Date(start + offset).toISOString() });
  const old = event('old', -1000);
  const fresh = event('fresh', 1000);
  const session = createArrivalSession(start);
  assert.deepEqual(session.unseen([old, fresh]), [fresh]);
  session.markSeen(fresh.id);
  assert.deepEqual(session.unseen([old, fresh]), []);
  const reloaded = createArrivalSession(start + 2000);
  assert.deepEqual(reloaded.unseen([old, fresh]), []);
  const delayed = event('delayed', 3000);
  assert.deepEqual(reloaded.unseen([old, fresh, delayed]), [delayed]);
});

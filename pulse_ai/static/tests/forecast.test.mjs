import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoForecastService, normalizeForecast, createHttpForecastService } from '../js/services/forecast.js';

test('demo matches the design and returns independent snapshots', async () => {
  const service = createDemoForecastService();
  const data = await service.load();
  assert.equal(data.confidenceThreshold, 0.9);
  assert.deepEqual(data.rows.map(row => [1, 6, 24].map(hour => row.horizons[hour]?.nodes.length ?? null)), [[0, 0, 2], [2, 3, 5], [1, 1, 3], [3, 4, 4], [0, 0, 6]]);
  data.rows[1].horizons[24].nodes.pop();
  assert.equal((await service.load()).rows[1].horizons[24].nodes.length, 5);
});

test('validates backend data and distinguishes missing predictions from zero nodes', async () => {
  const data = await createDemoForecastService().load();
  data.rows[0].horizons[6] = null;
  data.rows[0].horizons[1] = { severity: 'normal', nodes: [] };
  assert.equal(normalizeForecast(data).rows[0].horizons[1].nodes.length, 0);
  assert.equal(normalizeForecast(data).rows[0].horizons[6], null);
  assert.throws(() => normalizeForecast({ ...data, confidenceThreshold: 90 }));
  assert.throws(() => normalizeForecast({ ...data, rows: [data.rows[0], data.rows[0]] }));
  data.rows[0].horizons[24].nodes[0].node = null;
  assert.throws(() => normalizeForecast(data));
  assert.deepEqual(normalizeForecast({ confidenceThreshold: 0.9, rows: [] }).rows, []);
});

test('HTTP adapter forwards cancellation and rejects HTTP failures', async t => {
  const data = await createDemoForecastService().load();
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/forecast');
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => data };
  });
  assert.deepEqual(await createHttpForecastService('/api/forecast').load({ signal: controller.signal }), data);
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(createHttpForecastService('/api/forecast').load(), /503/);
  controller.abort();
  await assert.rejects(createDemoForecastService().load({ signal: controller.signal }), { name: 'AbortError' });
});

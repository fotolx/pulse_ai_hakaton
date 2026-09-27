import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoForecastService, normalizeForecast, createHttpForecastService, FORECAST_SNAPSHOT_KEY, syncForecastSnapshot } from '../js/services/forecast.js';

test('demo matches the design and returns independent snapshots', async () => {
  const service = createDemoForecastService();
  const data = await service.load();
  assert.equal(data.confidenceThreshold, 0.58);
  assert.deepEqual(data.rows.filter(row => row.period === 'short').map(row => [1, 6, 24].map(hour => row.horizons[hour]?.value ?? null)), [[null, null, 5], [1, null, null], [null, null, 3], [null, null, 2], [0, 0, 3], [null, null, 4], [0, 0, 6]]);
  data.rows[0].horizons[24].nodes.pop();
  assert.equal((await service.load()).rows[0].horizons[24].nodes.length, 6);
});

test('validates backend data and distinguishes missing predictions from zero nodes', async () => {
  const data = await createDemoForecastService().load();
  data.rows[0].horizons[6] = null;
  data.rows[0].horizons[1] = { value: 0, severity: 'normal', nodes: [] };
  assert.equal(normalizeForecast(data).rows[0].horizons[1].value, 0);
  assert.equal(normalizeForecast(data).rows[0].horizons[6], null);
  assert.throws(() => normalizeForecast({ ...data, confidenceThreshold: 90 }));
  assert.throws(() => normalizeForecast({ ...data, rows: [data.rows[0], data.rows[0]] }));
  data.rows[0].horizons[24].nodes[0].node = null;
  assert.throws(() => normalizeForecast(data));
  assert.deepEqual(normalizeForecast({ confidenceThreshold: 0.9, rows: [] }).rows, []);
});

test('forecast values are constrained to the ML visualization scale 0..20', async () => {
  const data = await createDemoForecastService().load();
  data.rows[0].horizons[24].value = 21;
  assert.throws(() => normalizeForecast(data), /Некорректный формат/);
});

test('background sync writes every loaded ML snapshot to browser storage', async t => {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => { delete globalThis.localStorage; });
  const snapshot = await syncForecastSnapshot(createDemoForecastService());
  assert.equal(JSON.parse(values.get(FORECAST_SNAPSHOT_KEY)).updatedAt, snapshot.updatedAt);
  assert.equal(JSON.parse(values.get(FORECAST_SNAPSHOT_KEY)).rows.length, 9);
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

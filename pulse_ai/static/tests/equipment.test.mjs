import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeEquipment, createEquipmentService } from '../js/services/equipment.js';
const fixture = JSON.parse(await readFile(new URL('../js/data/equipment-demo.json', import.meta.url), 'utf8'));
const sensor = data => data.stations[0].pickets[0].sensors[0];

test('equipment JSON preserves three forecast horizons, history and independent snapshots', () => {
  const result = normalizeEquipment(fixture);
  const first = result.stations[0].pickets[0];
  assert.equal(first.sensors.length, 19);
  assert.deepEqual(first.sensors[0].chart.history.map(point => point.hour), [-24, -6, -1, 0]);
  assert.deepEqual(first.sensors[0].chart.forecast.map(point => point.hour), [1, 6, 24]);
  first.sensors[0].chart.history[0].value = 77;
  assert.equal(sensor(fixture).chart.history[0].value, 8);
});

test('missing ML values stay null; unordered samples are sorted by horizon', () => {
  const data = structuredClone(fixture);
  sensor(data).displayValue = null;
  sensor(data).chart.forecast[1].value = null;
  sensor(data).chart.forecast.reverse();
  const result = sensor(normalizeEquipment(data));
  assert.equal(result.displayValue, null);
  assert.deepEqual(result.chart.forecast.map(point => point.value), [32, null, 78]);
});

test('rejects invalid horizons, duplicates, invalid ranges and unsafe media', () => {
  for (const mutate of [
    data => { sensor(data).chart.forecast[0].hour = 2; },
    data => { sensor(data).chart.forecast[0].value = '32'; },
    data => { sensor(data).chart.max = 0; },
    data => { sensor(data).chart.forecast[0].value = Infinity; },
    data => { data.stations[0].pickets[0].photos = ['javascript:alert(1)']; },
    data => { data.stations[0].pickets.push(data.stations[0].pickets[0]); },
  ]) {
    const data = structuredClone(fixture); mutate(data);
    assert.throws(() => normalizeEquipment(data), TypeError);
  }
});

test('HTTP service requests JSON from configured endpoint and rejects failures', async () => {
  let request;
  const service = createEquipmentService({ endpoint: '/api/equipment', demoUrl: '/demo.json' }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => fixture };
  });
  await service.load();
  assert.equal(request.url, '/api/equipment');
  assert.equal(request.options.headers.Accept, 'application/json');
  assert.equal(request.options.cache, 'no-store');
  const failing = createEquipmentService({ endpoint: '/api/equipment' }, async () => ({ ok: false, status: 503 }));
  await assert.rejects(failing.load(), /HTTP 503/);
});

test('HTTP service propagates cancellation and uses demo JSON without endpoint', async () => {
  const controller = new AbortController(); controller.abort();
  const service = createEquipmentService({ endpoint: null, demoUrl: '/demo.json' }, async (url, options) => {
    assert.equal(url, '/demo.json');
    options.signal.throwIfAborted();
  });
  await assert.rejects(service.load({ signal: controller.signal }), { name: 'AbortError' });
});

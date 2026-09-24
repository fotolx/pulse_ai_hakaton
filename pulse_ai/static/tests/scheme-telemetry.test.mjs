import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialSchemeTelemetry, normalizeSchemeTelemetryPatch, mergeSchemeTelemetry,
  createHttpSchemeTelemetryService, startSchemeTelemetryPolling,
} from '../js/services/scheme-telemetry.js';

test('ML patch updates only supplied station, sensor and metric values', () => {
  const patch = normalizeSchemeTelemetryPatch({
    station: { loadActual: 68 },
    sensors: { '103-temperature': { value: '38.1 °C', tone: 'warning' } },
    metrics: { activeAlerts: 3 },
  });
  const next = mergeSchemeTelemetry(initialSchemeTelemetry, patch);
  assert.equal(next.station.loadActual, 68);
  assert.equal(next.station.voltageActual, 10.5);
  assert.equal(next.sensors['103-temperature'].value, '38.1 °C');
  assert.equal(next.sensors['103-temperature'].label, 'Датчик температуры');
  assert.equal(next.sensors['104-smoke'].value, 'Нет задымления');
  assert.equal(next.metrics.activeAlerts, 3);
  assert.equal(initialSchemeTelemetry.station.loadActual, 62);
});

test('rejects malformed ML readings and unknown sensor IDs', () => {
  assert.throws(() => normalizeSchemeTelemetryPatch({ sensors: { '103-temperature': { tone: 'critical' } } }), /статус/);
  assert.throws(() => normalizeSchemeTelemetryPatch({ sensors: { '103-temprature': { value: 40 } } }), /Неизвестный датчик/);
  assert.throws(() => normalizeSchemeTelemetryPatch({ station: { loadActual: Infinity } }), /подстанции/);
  assert.throws(() => normalizeSchemeTelemetryPatch({ metrics: { activeAlerts: {} } }), /показатель/);
});

test('HTTP adapter validates JSON and forwards abort signal', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/ml/scheme');
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({ sensors: { '105-smoke': { value: 'Обнаружен дым', tone: 'danger' } } }) };
  });
  const service = createHttpSchemeTelemetryService('/api/ml/scheme');
  assert.equal((await service.load({ signal: controller.signal })).sensors['105-smoke'].tone, 'danger');
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(service.load(), /503/);
});

test('polling stops after abort and does not schedule another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const service = { async load() { calls += 1; return normalizeSchemeTelemetryPatch({ station: { loadActual: 70 } }); } };
  await new Promise(resolve => {
    startSchemeTelemetryPolling(service, {
      signal: controller.signal,
      onData(patch) { assert.equal(patch.station.loadActual, 70); controller.abort(); resolve(); },
      intervalMs: 1000,
    });
  });
  assert.equal(calls, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalNodeDecisionService } from '../js/services/node-decisions.js';
import { districtNode107, districtNode103 } from '../js/data/district-node.js';

test('alarm decisions persist independently from monitoring at another node', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const service = createLocalNodeDecisionService(() => storage);
  const monitoring = service.saveMonitoring(districtNode107);
  for (const decision of ['dispatch', 'false-alarm', 'monitoring']) {
    const record = service.saveDecision(districtNode103, decision);
    assert.equal(record.decision, decision);
    assert.equal(record.sensors.find(sensor => sensor.name === 'Температура').value, '64.2 °C');
    assert.deepEqual(createLocalNodeDecisionService(() => storage).load('103'), record);
    assert.deepEqual(service.load('107'), monitoring);
  }
  assert.throws(() => service.saveDecision(districtNode103, 'unknown'), /Неизвестное/);
});

test('monitoring persists a separate sensor snapshot across service recreation without duplicates', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const service = createLocalNodeDecisionService(() => storage);
  const node = structuredClone(districtNode107);
  assert.equal(service.load(node.id), null);
  const record = service.saveMonitoring(node);
  node.sensors[0].value = 'Изменено';
  assert.equal(record.sensors[0].value, 'На охране');
  assert.equal(record.source, 'demo');
  const restored = createLocalNodeDecisionService(() => storage);
  assert.deepEqual(restored.load('107'), record);
  assert.deepEqual(restored.saveMonitoring(node), record);
});

test('storage failures propagate without reporting a saved decision', () => {
  const storage = { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } };
  const service = createLocalNodeDecisionService(() => storage);
  assert.throws(() => service.saveMonitoring(districtNode107), /Quota/);
  assert.equal(service.load('107'), null);
  storage.getItem = () => '{broken';
  assert.throws(() => service.saveMonitoring(districtNode107));
});

test('planned maintenance persists for 107 and can be changed to monitoring', () => {
  const items = new Map();
  const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const service = createLocalNodeDecisionService(() => storage);
  const record = service.saveDecision(districtNode107, 'maintenance');
  assert.equal(record.nodeId, '107');
  assert.deepEqual(createLocalNodeDecisionService(() => storage).load('107'), record);
  assert.equal(service.load('106'), null);
  assert.deepEqual(service.saveDecision(districtNode107, 'maintenance'), record);
  service.saveMonitoring(districtNode107);
  assert.equal(service.load('107').decision, 'monitoring');
});

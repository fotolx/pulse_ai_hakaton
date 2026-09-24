import assert from 'node:assert/strict';
import test from 'node:test';
import { eventDateRange, isWithinEventDateRange } from '../js/pages/event-dates.js';

test('date presets have inclusive boundaries', () => {
  const today = '2026-09-24';
  const cases = [
    ['today', '2026-09-24', '2026-09-24', '2026-09-23'],
    ['week', '2026-09-18', '2026-09-24', '2026-09-17'],
    ['month', '2026-08-26', '2026-09-24', '2026-08-25'],
  ];
  for (const [period, first, last, outside] of cases) {
    const range = eventDateRange(period, today);
    assert.equal(isWithinEventDateRange(first, range), true);
    assert.equal(isWithinEventDateRange(last, range), true);
    assert.equal(isWithinEventDateRange(outside, range), false);
  }
});

test('custom dates include both endpoints and reject incomplete or reversed intervals', () => {
  const range = eventDateRange('custom', '2026-09-24', '2026-09-01', '2026-09-10');
  assert.equal(isWithinEventDateRange('2026-09-01', range), true);
  assert.equal(isWithinEventDateRange('2026-09-10', range), true);
  assert.equal(isWithinEventDateRange('2026-09-11', range), false);
  assert.equal(isWithinEventDateRange('2026-09-05', { from: '2026-09-10', to: '2026-09-01' }), false);
  assert.equal(isWithinEventDateRange('2026-09-05', { from: '', to: '2026-09-10' }), false);
});

import { forecastDemo } from '../data/forecast.js';

export const forecastHorizons = [1, 6, 24];

export function normalizeForecast(data) {
  const invalid = () => { throw new TypeError('Некорректный формат прогноза'); };
  if (!data || !Number.isFinite(data.confidenceThreshold) || data.confidenceThreshold < 0 || data.confidenceThreshold > 1 || !Array.isArray(data.rows)) invalid();
  const ids = new Set();
  const rows = data.rows.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.title !== 'string' || !row.title || !row.horizons) invalid();
    ids.add(row.id);
    const horizons = {};
    for (const hour of forecastHorizons) {
      const cell = row.horizons[hour];
      if (cell === null) { horizons[hour] = null; continue; }
      if (!cell || !['normal', 'danger'].includes(cell.severity) || !Array.isArray(cell.nodes)) invalid();
      horizons[hour] = { severity: cell.severity, nodes: cell.nodes.map(node => {
        if (!node || ['node', 'picket', 'district'].some(key => typeof node[key] !== 'string' || !node[key])) invalid();
        return { node: node.node, picket: node.picket, district: node.district };
      }) };
    }
    return { id: row.id, title: row.title, horizons };
  });
  return { confidenceThreshold: data.confidenceThreshold, rows };
}

export function createDemoForecastService() {
  return { async load({ signal } = {}) { signal?.throwIfAborted(); return normalizeForecast(forecastDemo); } };
}

// URL задаётся при интеграции с ML-бэкендом; ответ соответствует forecastDemo.
export function createHttpForecastService(url) {
  return { async load({ signal } = {}) {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
    return normalizeForecast(await response.json());
  } };
}

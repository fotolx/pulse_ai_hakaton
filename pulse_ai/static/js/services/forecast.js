import { forecastDemo } from '../data/forecast.js?v=forecast-popup-2';

export const forecastPeriods = [
  { id: 'short', horizons: [1, 6, 24], labels: ['Статус 1ч', 'Статус 6ч', 'Статус 24 ч'] },
  { id: 'long', horizons: [168, 720], labels: ['Статус 7д', 'Статус 30 д'] },
];
export const forecastHorizons = forecastPeriods.flatMap(period => period.horizons);
export const FORECAST_SNAPSHOT_KEY = 'collector:forecast-snapshot:v1';
export const FORECAST_SELECTION_KEY = 'collector:forecast-selection:v1';

// Keep the established table layout even before the API has returned any data.
// Only titles and periods come from the catalog, never demo predictions.
export function createForecastView(data) {
  const aliases = { flood: 'flooding', engineering: 'system-fault', sensor: 'channel-fault' };
  const remaining = new Map((data?.rows ?? []).map(row => [row.id, row]));
  const rows = forecastDemo.rows.map(({ id, period, title }) => {
    const source = remaining.get(id) ?? remaining.get(aliases[id]);
    if (source?.period === period) {
      remaining.delete(source.id);
      return { ...source, title };
    }
    return { id, period, title, horizons: Object.fromEntries(forecastPeriods.find(item => item.id === period).horizons.map(hour => [hour, null])) };
  });
  return { ...data, rows: [...rows, ...remaining.values()] };
}

export function normalizeForecast(data) {
  const invalid = () => { throw new TypeError('Некорректный формат прогноза'); };
  if (!data || !Number.isFinite(data.confidenceThreshold) || data.confidenceThreshold < 0 || data.confidenceThreshold > 1 || !Array.isArray(data.rows)) invalid();
  const ids = new Set();
  const rows = data.rows.map(row => {
    const period = row?.period ?? 'short';
    const periodConfig = forecastPeriods.find(item => item.id === period);
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.title !== 'string' || !row.title || !row.horizons || !periodConfig) invalid();
    ids.add(row.id);
    const horizons = {};
    for (const hour of periodConfig.horizons) {
      const source = row.horizons[hour];
      if (source === null) { horizons[hour] = null; continue; }
      if (!source || !['none', 'normal', 'warning', 'danger'].includes(source.severity) || !Array.isArray(source.nodes)) invalid();
      const value = source.value ?? source.nodes.length;
      if (!Number.isSafeInteger(value) || value < 0) invalid();
      const severity = source.severity === 'none' ? 'normal' : source.severity;
      horizons[hour] = { value, severity, nodes: source.nodes.map(node => {
        if (!node || ['node', 'picket', 'district'].some(key => typeof node[key] !== 'string' || !node[key])) invalid();
        return { node: node.node, picket: node.picket, district: node.district };
      }) };
    }
    return { id: row.id, period, title: row.title, horizons };
  });
  return { version: 1, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(), confidenceThreshold: data.confidenceThreshold, rows };
}

export function storeForecastSnapshot(data) {
  const snapshot = normalizeForecast(data);
  try { globalThis.localStorage?.setItem(FORECAST_SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch { /* Storage can be unavailable. */ }
  globalThis.document?.dispatchEvent(new CustomEvent('forecast:snapshot', { detail: snapshot }));
  return snapshot;
}

export function readForecastSnapshot() {
  try {
    const stored = globalThis.localStorage?.getItem(FORECAST_SNAPSHOT_KEY);
    return stored ? normalizeForecast(JSON.parse(stored)) : normalizeForecast(forecastDemo);
  } catch { return normalizeForecast(forecastDemo); }
}

export function storeForecastSelection(node, { incidentId = 'fire', horizon = 24 } = {}) {
  const selection = { version: 1, savedAt: new Date().toISOString(), incidentId, horizon, node };
  try { globalThis.localStorage?.setItem(FORECAST_SELECTION_KEY, JSON.stringify(selection)); } catch { /* Storage can be unavailable. */ }
  return selection;
}

export function readForecastSelection() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(FORECAST_SELECTION_KEY));
    return value?.version === 1 && value.node?.picket ? value : null;
  } catch { return null; }
}

export function createDemoForecastService() {
  return { async load({ signal } = {}) { signal?.throwIfAborted(); return normalizeForecast(forecastDemo); } };
}

export function forecastApiUrl(location = globalThis.location) {
  if (!location) return '/api/forecast';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return local ? `${location.protocol}//${location.hostname}:3000/api/forecast` : '/api/forecast';
}

// Production uses the current domain. Any localhost development port uses the
// proxy exposed by `npm start` on port 3000.
export function createHttpForecastService(url = forecastApiUrl()) {
  let pending;
  return { async load({ signal } = {}) {
    signal?.throwIfAborted();
    // The dialog and background sync share one request. Closing the dialog must
    // not cancel the background consumer of that same response.
    if (!pending) {
      pending = (async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
        return normalizeForecast(await response.json());
      })().finally(() => { pending = null; });
    }
    const shared = pending;
    if (!signal) return shared;
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  } };
}

export async function syncForecastSnapshot(service, { signal } = {}) {
  signal?.throwIfAborted();
  return storeForecastSnapshot(await service.load({ signal }));
}

// Общий цикл синхронизации для HTTP API и демонстрационного сервиса.
export function startForecastSnapshotSync(service, { intervalMs = 15000, onError } = {}) {
  const controller = new AbortController();
  let timer, running = false;
  const schedule = () => {
    if (!controller.signal.aborted) timer = setTimeout(run, Math.max(1000, intervalMs));
  };
  const run = async () => {
    if (running || controller.signal.aborted) return;
    running = true;
    clearTimeout(timer);
    try { await syncForecastSnapshot(service, { signal: controller.signal }); }
    catch (error) { if (error.name !== 'AbortError') onError?.(error); }
    finally { running = false; schedule(); }
  };
  const refreshWhenVisible = () => { if (globalThis.document?.visibilityState === 'visible') run(); };
  globalThis.document?.addEventListener('visibilitychange', refreshWhenVisible, { signal: controller.signal });
  run();
  return {
    refresh: run,
    stop() { clearTimeout(timer); controller.abort(); },
  };
}

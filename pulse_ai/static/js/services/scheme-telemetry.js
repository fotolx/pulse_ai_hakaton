// Public input contract for future ML transport. Fields may arrive as partial updates.
// document.dispatchEvent(new CustomEvent('scheme:telemetry', { detail: { sensors: {
//   '103-temperature': { value: '38.1 °C', tone: 'warning' }
// }, station: { loadActual: 68 }, metrics: { activeAlerts: 3 } } }));
export const initialSchemeTelemetry = {
  station: { loadPlan: 70, loadActual: 62, voltagePlan: 10.5, voltageActual: 10.5, transformerTemp: 41 },
  sensors: {
    'line-1': { value: '42 °C · норма' }, 'line-2': { value: '42 °C · норма' },
    'line-3': { value: '68 °C · перегрев', tone: 'danger' }, 'line-4': { value: '42 °C · норма' },
    'line-5': { value: '42 °C · норма' },
    '103-smoke': { label: 'Дымовой датчик', value: 'Обнаружен дым', tone: 'danger' },
    '103-motion': { label: 'Датчик движения', value: 'Не обнаружено' },
    '103-state': { label: 'Состояние вентилятора', value: 'Работает' },
    '103-switch': { label: 'Переключатель', value: 'Вкл' },
    '103-temperature': { label: 'Датчик температуры', value: '34.2 °C' },
    '104-smoke': { label: 'Дымовой датчик', value: 'Нет задымления' },
    '105-smoke': { label: 'Дымовой датчик', value: 'Нет задымления' },
    '105-ups': { label: 'Состояние УИР-Р', value: 'Дежурный режим' },
    '105-motion': { label: 'Датчик движения', value: 'Не обнаружено' },
    '105-power': { label: 'КД АВ', value: 'На охране' },
    '105-phase': { label: 'Состояние фазы', value: 'Норма' },
    '105-temperature': { label: 'Датчик температуры', value: '34.2 °C' },
  },
  metrics: {},
};

const metricKeys = new Set([
  'networkLength', 'modelAccuracy', 'averageDailyAlerts', 'decisions',
  'maintenance', 'requests', 'activeAlerts', 'offline', 'permits',
  'highestRisk', 'atRisk',
]);
const stationKeys = new Set(Object.keys(initialSchemeTelemetry.station));
const sensorKeys = new Set(Object.keys(initialSchemeTelemetry.sensors));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDisplayValue = value => (typeof value === 'string' && value.length <= 160) || (typeof value === 'number' && Number.isFinite(value));

// Единый формат для WebSocket/SSE, CustomEvent и HTTP: все разделы необязательны.
export function normalizeSchemeTelemetryPatch(patch) {
  if (!isRecord(patch)) throw new TypeError('Некорректные данные схемы');
  const result = { station: {}, sensors: {}, metrics: {} };
  if (patch.station !== undefined) {
    if (!isRecord(patch.station)) throw new TypeError('Некорректные данные подстанции');
    for (const [key, value] of Object.entries(patch.station)) {
      if (!stationKeys.has(key)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Некорректное значение подстанции: ${key}`);
      result.station[key] = value;
    }
  }
  if (patch.sensors !== undefined) {
    if (!isRecord(patch.sensors)) throw new TypeError('Некорректные данные датчиков');
    for (const [key, value] of Object.entries(patch.sensors)) {
      if (!sensorKeys.has(key)) throw new TypeError(`Неизвестный датчик: ${key}`);
      if (!isRecord(value)) throw new TypeError(`Некорректный датчик: ${key}`);
      const sensor = {};
      if (value.label !== undefined) {
        if (typeof value.label !== 'string' || value.label.length > 80) throw new TypeError(`Некорректная подпись датчика: ${key}`);
        sensor.label = value.label;
      }
      if (value.value !== undefined) {
        if (!isDisplayValue(value.value)) throw new TypeError(`Некорректное показание датчика: ${key}`);
        sensor.value = String(value.value);
      }
      if (value.tone !== undefined) {
        if (!['normal', 'warning', 'danger'].includes(value.tone)) throw new TypeError(`Некорректный статус датчика: ${key}`);
        sensor.tone = value.tone;
      }
      if (Object.keys(sensor).length) result.sensors[key] = sensor;
    }
  }
  if (patch.metrics !== undefined) {
    if (!isRecord(patch.metrics)) throw new TypeError('Некорректные показатели сети');
    for (const [key, value] of Object.entries(patch.metrics)) {
      if (!metricKeys.has(key)) continue;
      if (!isDisplayValue(value)) throw new TypeError(`Некорректный показатель сети: ${key}`);
      result.metrics[key] = value;
    }
  }
  return result;
}

export function mergeSchemeTelemetry(current, patch) {
  const next = normalizeSchemeTelemetryPatch(patch);
  return {
    station: { ...current.station, ...next.station },
    sensors: Object.fromEntries(Object.entries(current.sensors).map(([key, value]) => [key, next.sensors[key] ? { ...value, ...next.sensors[key] } : value])),
    metrics: { ...current.metrics, ...next.metrics },
  };
}

// URL задаётся при интеграции. Ответ может содержать полный снимок или частичное обновление.
export function createHttpSchemeTelemetryService(url) {
  if (!url) throw new TypeError('Не указан адрес источника данных схемы');
  return { async load({ signal } = {}) {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Scheme telemetry HTTP ${response.status}`);
    return normalizeSchemeTelemetryPatch(await response.json());
  } };
}

export function startSchemeTelemetryPolling(service, { onData, onError, intervalMs = 5000, signal } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new RangeError('Интервал обновления должен быть не меньше 1000 мс');
  let timer;
  let stopped = false;
  let request;
  const stop = () => { stopped = true; clearTimeout(timer); request?.abort(); };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) { stop(); return stop; }
  const poll = async () => {
    request = new AbortController();
    try {
      const patch = await service.load({ signal: request.signal });
      if (!stopped) onData?.(patch);
    } catch (error) {
      if (!stopped && error.name !== 'AbortError') onError?.(error);
    } finally {
      request = undefined;
      if (!stopped) timer = setTimeout(poll, intervalMs);
    }
  };
  poll();
  return stop;
}

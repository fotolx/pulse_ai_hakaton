export const equipmentHours = [-24, -6, -1, 0, 1, 6, 24];
const fail = () => { throw new TypeError('Некорректный JSON реестра оборудования'); };
const text = value => { if (typeof value !== 'string' || !value.trim()) fail(); return value; };
const number = (value, min = 0, max = Infinity) => {
  if (!Number.isFinite(value) || value < min || value > max) fail();
  return value;
};
const nullableText = value => value == null ? null : text(value);
function asset(value) {
  if (value == null) return null;
  text(value);
  if (!/^(https?:\/\/|\.?\.?\/)/i.test(value) || value.startsWith('//')) fail();
  return value;
}
function fields(value) {
  if (!Array.isArray(value)) fail();
  return value.map(item => ({ label: text(item?.label), value: item.value == null ? '—' : text(item.value) }));
}
export function normalizeEquipment(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.stations)) fail();
  if (typeof data.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(data.updatedAt) || !Number.isFinite(Date.parse(data.updatedAt))) fail();
  const stationIds = new Set();
  return {
    version: 1, updatedAt: data.updatedAt,
    stations: data.stations.map(station => {
      const id = text(station.id);
      if (stationIds.has(id) || !Array.isArray(station.pickets)) fail();
      stationIds.add(id);
      const picketIds = new Set();
      return { id, name: text(station.name), pickets: station.pickets.map(picket => {
        const id = text(picket.id);
        if (picketIds.has(id) || !Array.isArray(picket.sensors) || !Array.isArray(picket.photos)) fail();
        picketIds.add(id);
        const sensorIds = new Set();
        const sensors = picket.sensors.map(sensor => {
          const id = text(sensor.id);
          if (sensorIds.has(id) || !['key', 'additional'].includes(sensor.group) || !['normal', 'danger', 'unknown'].includes(sensor.severity)) fail();
          sensorIds.add(id);
          let chart = null;
          if (sensor.chart != null) {
            const source = sensor.chart;
            const min = number(source.min, -Infinity), max = number(source.max, min);
            if (min === max) fail();
            const series = (items, hours) => {
              if (!Array.isArray(items) || items.length !== hours.length) fail();
              return hours.map(hour => {
                const matches = items.filter(point => point?.hour === hour);
                if (matches.length !== 1) fail();
                const value = matches[0].value;
                return { hour, value: value === null ? null : number(value, min, max) };
              });
            };
            chart = { min, max, unit: typeof source.unit === 'string' ? source.unit : '',
              history: series(source.history, [-24, -6, -1, 0]), forecast: series(source.forecast, [1, 6, 24]) };
          }
          return { id, name: text(sensor.name), group: sensor.group, severity: sensor.severity,
            displayValue: nullableText(sensor.displayValue), chart };
        });
        const summary = picket.summary;
        if (!summary || !Array.isArray(summary.sections)) fail();
        return { id, photos: picket.photos.map(value => asset(text(value))), videoUrl: asset(picket.videoUrl), schemeUrl: asset(picket.schemeUrl), sensors,
          summary: { totalSensors: number(summary.totalSensors), accuracy: summary.accuracy === null ? null : number(summary.accuracy, 0, 1),
            sections: summary.sections.map(section => {
              if (!['normal', 'danger', 'warning', 'neutral'].includes(section.tone)) fail();
              return { title: text(section.title), badge: nullableText(section.badge), tone: section.tone, fields: fields(section.fields) };
            }) } };
      }) };
    }),
  };
}

// The same contract is used for a local fixture, polling, and pushed ML snapshots.
export function createEquipmentService({ endpoint, demoUrl, timeoutMs = 10000 }, fetcher = fetch) {
  return { async load({ signal } = {}) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetcher(endpoint || demoUrl, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Реестр оборудования: HTTP ${response.status}`);
    return normalizeEquipment(await response.json());
  } };
}

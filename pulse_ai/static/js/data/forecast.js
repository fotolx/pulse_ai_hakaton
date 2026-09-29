// Демонстрационный снимок имеет тот же контракт, что и будущий ответ ML API.
const pickets = Object.fromEntries(['104', '105', '106', '107', '108', '109'].map(picket => [picket, {
  node: picket,
  picket,
  district: picket === '107' ? 'Щелковский' : 'Первомайский',
}]));
const cell = (ids, severity = 'normal') => ids === null ? null : ({
  value: ids.length,
  severity,
  nodes: ids.map(id => pickets[id]),
});

export const forecastDemo = {
  version: 1,
  updatedAt: '2026-09-28T20:30:00+03:00',
  confidenceThreshold: 0.58,
  rows: [
    { id: 'fire', period: 'short', title: 'Пожарный риск', horizons: { 1: cell(null), 6: cell(null), 24: cell(['104', '105', '106', '107', '108']) } },
    { id: 'rapid-fire', period: 'short', title: 'Быстрое развитие пожарного сценария', horizons: { 1: cell(['104'], 'danger'), 6: cell(null), 24: cell(null) } },
    { id: 'engineering', period: 'short', title: 'Риск отказа инженерной системы', horizons: { 1: cell(null), 6: cell(null), 24: cell(['104', '105', '109']) } },
    { id: 'sensor', period: 'short', title: 'Классификатор отказа датчика', horizons: { 1: cell(null), 6: cell(null), 24: cell(['104', '106']) } },
    { id: 'flood', period: 'short', title: 'Риск подтопления', horizons: { 1: cell([]), 6: cell([]), 24: cell(['104', '108', '109']) } },
    { id: 'access', period: 'short', title: 'Риск несанкционированного проникновения', horizons: { 1: cell(null), 6: cell(null), 24: cell(['104', '106', '107', '108']) } },
    { id: 'maintenance', period: 'short', title: 'Плановое ТО', horizons: { 1: cell([]), 6: cell([]), 24: cell(['104', '105', '106', '107', '108', '109']) } },
    { id: 'preventive-repair', period: 'long', title: 'Необходимость предупредительного ремонта', horizons: { 168: cell(['104', '105', '109']), 720: cell(null) } },
    { id: 'early-maintenance', period: 'long', title: 'Необходимость планирования досрочного ТО', horizons: { 168: cell(null), 720: cell(['106', '108', '109']) } },
  ],
};

// Демонстрационный снимок имеет тот же контракт, что и будущий ответ ML API.
const pickets = Object.fromEntries(['104', '105', '106', '107', '108', '109'].map(picket => [picket, {
  node: picket,
  picket,
  district: 'Первомайский',
}]));
const cell = (ids, severity = 'normal') => ids === null ? null : ({
  value: ids.length,
  severity,
  nodes: ids.map(id => pickets[id]),
});

export const forecastDemo = {
  version: 1,
  updatedAt: '2026-09-28T20:30:00+03:00',
  confidenceThreshold: 0.82,
  rows: [
    { id: 'fire', period: 'short', title: 'Пожарный риск', horizons: { 1: cell([]), 6: cell(['104']), 24: cell(['104']) } },
    { id: 'rapid-fire', period: 'short', title: 'Быстрое развитие пожарного сценария', horizons: { 1: cell(['104'], 'danger'), 6: cell(['104'], 'danger'), 24: cell(null) } },
    { id: 'engineering', period: 'short', title: 'Риск отказа инженерной системы', horizons: { 1: cell([]), 6: cell(['105']), 24: cell(['105', '109']) } },
    { id: 'sensor', period: 'short', title: 'Классификатор отказа датчика', horizons: { 1: cell([]), 6: cell([]), 24: cell(['106']) } },
    { id: 'flood', period: 'short', title: 'Риск подтопления', horizons: { 1: cell([]), 6: cell(['108']), 24: cell(['108', '109']) } },
    { id: 'access', period: 'short', title: 'Риск несанкционированного проникновения', horizons: { 1: cell([]), 6: cell(['107']), 24: cell(['107']) } },
    { id: 'maintenance', period: 'short', title: 'Плановое ТО', horizons: { 1: cell([]), 6: cell(['105']), 24: cell(['105', '106', '109']) } },
    { id: 'preventive-repair', period: 'long', title: 'Необходимость предупредительного ремонта', horizons: { 168: cell(['105', '109']), 720: cell(['105', '106', '109']) } },
    { id: 'early-maintenance', period: 'long', title: 'Необходимость планирования досрочного ТО', horizons: { 168: cell(['106']), 720: cell(['106', '108']) } },
  ],
};

// Демонстрационный снимок имеет тот же контракт, что и будущий ответ ML API.
const pickets = ['104', '105', '106', '107', '108', '109'].map(picket => ({
  node: picket,
  picket,
  district: picket === '107' ? 'Щёлковский' : 'Первомайский',
}));
const cell = (value, severity = 'normal', detailCount = value) => value === null ? null : ({ value, severity, nodes: pickets.slice(0, detailCount) });

export const forecastDemo = {
  version: 1,
  updatedAt: '2026-09-18T16:34:12+03:00',
  confidenceThreshold: 0.58,
  rows: [
    { id: 'fire', period: 'short', title: 'Пожарный риск', horizons: { 1: cell(null), 6: cell(null), 24: cell(5, 'normal', 6) } },
    { id: 'rapid-fire', period: 'short', title: 'Быстрое развитие пожарного сценария', horizons: { 1: cell(1, 'danger'), 6: cell(null), 24: cell(null) } },
    { id: 'engineering', period: 'short', title: 'Риск отказа инженерной системы', horizons: { 1: cell(null), 6: cell(null), 24: cell(3) } },
    { id: 'sensor', period: 'short', title: 'Классификатор отказа датчика', horizons: { 1: cell(null), 6: cell(null), 24: cell(2) } },
    { id: 'flood', period: 'short', title: 'Риск подтопления', horizons: { 1: cell(0), 6: cell(0), 24: cell(3) } },
    { id: 'access', period: 'short', title: 'Риск несанкционированного проникновения', horizons: { 1: cell(null), 6: cell(null), 24: cell(4) } },
    { id: 'maintenance', period: 'short', title: 'Плановое ТО', horizons: { 1: cell(0), 6: cell(0), 24: cell(6) } },
    { id: 'preventive-repair', period: 'long', title: 'Необходимость предупредительного ремонта', horizons: { 168: cell(3), 720: cell(null) } },
    { id: 'early-maintenance', period: 'long', title: 'Необходимость планирования досрочного ТО', horizons: { 168: cell(null), 720: cell(3) } },
  ],
};

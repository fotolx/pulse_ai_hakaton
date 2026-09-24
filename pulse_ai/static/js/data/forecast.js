// Демонстрационные результаты, не предсказания работающих моделей.
const nodes = [
  { node: '105', picket: '105', district: 'Первомайский' },
  { node: '106', picket: '106', district: 'Первомайский' },
  { node: '107', picket: '107', district: 'Щёлковский' },
  { node: '108', picket: '108', district: 'Первомайский' },
  { node: '109', picket: '109', district: 'Первомайский' },
  { node: '110', picket: '110', district: 'Первомайский' },
];
const cell = (count, severity = 'normal') => ({ severity, nodes: nodes.slice(0, count) });
export const forecastDemo = {
  confidenceThreshold: 0.9,
  rows: [
    { id: 'sensor', title: 'Классификатор отказа датчика', horizons: { 1: cell(0), 6: cell(0), 24: cell(2) } },
    { id: 'fire', title: 'Пожарный риск', horizons: { 1: cell(2), 6: cell(3), 24: cell(5, 'danger') } },
    { id: 'flood', title: 'Риск подтопления', horizons: { 1: cell(1), 6: cell(1), 24: cell(3) } },
    { id: 'access', title: 'Аномалия доступа', horizons: { 1: cell(3), 6: cell(4), 24: cell(4, 'danger') } },
    { id: 'maintenance', title: 'Плановое ТО', horizons: { 1: cell(0), 6: cell(0), 24: cell(6, 'danger') } },
  ],
};

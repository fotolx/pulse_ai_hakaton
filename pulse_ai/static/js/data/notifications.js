const examples = [
  ['105', 'Первомайский', 'Пожар — обнаружен дым', 2, 'danger'],
  ['103', 'Первомайский', 'Пожар — совпадение с трендом t°', 5, 'danger'],
  ['104', 'Первомайский', 'Каскад: рядом узел 105', 5, 'danger'],
  ['102', 'Первомайский', 'ИБП — много неисправных', 6, 'danger'],
  ['401', 'Щёлковский', 'Требует проверки', 18, 'warning'],
  ['402', 'Сокольнический', 'Требует проверки', 24, 'warning'],
  ['403', 'Щёлковский', 'Требует проверки', 31, 'warning'],
  ['201', 'Соединение', 'Нет связи с узлом', 40, 'danger'],
  ['108', 'Первомайский', 'Тоннель 107–108 — тревога на участке', 52, 'danger'],
];
export function createDemoNotifications(now = Date.now()) {
  return examples.map(([node, district, description, minutes, severity]) => ({
    id: `demo-${node}`, title: `Узел ${node} · ${district}`, description, severity,
    createdAt: new Date(now - minutes * 60000).toISOString(), readAt: null,
  }));
}

const groups = [
  { icon: 'Union.svg', title: 'Общие', fields: [
    ['networkLength', 'Протяжённость сети'], ['modelAccuracy', 'Точность модели'],
  ] },
  { icon: 'IconEdit.svg', title: 'В среднем за смену', fields: [
    ['averageDailyAlerts', 'Тревог'], ['decisions', 'Решений'],
  ] },
  { icon: 'graf.svg', title: 'Сегодня', fields: [
    ['maintenance', 'Плановых ТО'], ['requests', 'Заявок в работе'],
    ['activeAlerts', 'Активных тревог'], ['offline', 'Без связи'],
    ['permits', 'Допуск активен'],
  ] },
  { icon: 'at.svg', title: 'Прогноз (24ч)', modifier: 'forecast', fields: [
    ['highestRisk', 'Наибольший риск', 'danger'], ['atRisk', 'Всего в зоне риска'],
  ] },
  { icon: 'IconWorldStroked.svg', title: 'Текущее время', fields: [['updatedAt', 'Текущая дата']], modifier: 'updated' },
];

export function mountMetrics(root, initialData, { generalTitle } = {}) {
  root.innerHTML = '<section class="metrics" aria-label="Показатели сети" tabindex="0"><div class="metrics__groups">' + groups.map(({ title, icon, fields, modifier }) =>
    '<div class="metrics__group' + (modifier ? ' metrics__group--' + modifier : '') + '">' +
    (title ? '<h2 class="metrics__heading"><img class="metrics__icon" src="' + new URL('../../../img/icons/' + icon, import.meta.url).href + '" width="14" height="14" alt="" aria-hidden="true">' + title + '</h2>' : '') +
    '<dl class="metrics__list">' + fields.map(([key, label, tone]) =>
      '<div class="metrics__item"><dt class="metrics__label">' + label + '</dt>' +
      '<dd class="metrics__value' + (tone ? ' metrics__value--' + tone : '') + '" data-metric="' + key + '">—</dd></div>'
    ).join('') + '</dl></div>'
  ).join('') + '</div></section>';
  if (generalTitle) root.querySelector('.metrics__heading').lastChild.textContent = generalTitle;
  function updateClock() {
    const now = new Date();
    const item = root.querySelector('[data-metric="updatedAt"]');
    item.textContent = now.toLocaleTimeString('ru-RU');
    item.previousElementSibling.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
  }
  function update(data) {
    groups.flatMap(group => group.fields).forEach(([key]) => {
      if (Object.hasOwn(data, key)) root.querySelector('[data-metric="' + key + '"]').textContent = data[key] ?? '—';
    });
  }
  update(initialData);
  updateClock();
  const timer = setInterval(updateClock, 1000);
  return { update, destroy() { clearInterval(timer); } };
}

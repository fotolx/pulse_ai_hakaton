import { forecastPeriods, normalizeForecast, storeForecastSnapshot } from '../../services/forecast.js';

export function mountForecast({ service, onOpenPicket }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'forecast';
  dialog.id = 'forecast-dialog';
  dialog.setAttribute('aria-labelledby', 'forecast-title');
  dialog.innerHTML = `<header class="forecast__header"><h2 class="forecast__title" id="forecast-title" tabindex="-1">Прогноз инцидентов</h2><p class="forecast__threshold" hidden>точность модели <span class="forecast__confidence"></span></p><button class="forecast__close" type="button" aria-label="Закрыть прогноз инцидентов">×</button></header><p class="forecast__status" role="status" hidden></p><button class="forecast__retry" type="button" hidden>Повторить загрузку</button><div class="forecast__tables"></div><footer class="forecast__footer"><button class="forecast__action" data-action="notify" aria-disabled="true" type="button">Уведомить техников <span aria-hidden="true">→</span></button></footer>`;
  document.body.append(dialog);
  const tables = dialog.querySelector('.forecast__tables');
  const status = dialog.querySelector('.forecast__status');
  const retry = dialog.querySelector('.forecast__retry');
  const threshold = dialog.querySelector('.forecast__threshold');
  const lifecycle = new AbortController();
  const chosen = new Set();
  let request, opener, snapshot, revision = 0;
  let selected = { id: 'fire', hour: 24 };
  const key = (row, node) => JSON.stringify([row.id, node.node, node.picket, node.district]);
  const periodFor = row => forecastPeriods.find(period => period.id === row.period);
  const allNodes = row => [...new Map(periodFor(row).horizons.flatMap(hour => row.horizons[hour]?.nodes ?? []).map(node => [key(row, node), node])).values()];
  const element = (tag, className, text) => { const item = document.createElement(tag); item.className = className; if (text !== undefined) item.textContent = text; return item; };
  function checkbox(label, checked, change) {
    const input = element('input', 'forecast__checkbox');
    input.type = 'checkbox'; input.checked = checked; input.setAttribute('aria-label', label);
    input.addEventListener('change', () => change(input.checked));
    return input;
  }
  function updateGroups() {
    tables.querySelectorAll('[data-group]').forEach(input => {
      const row = snapshot.rows.find(item => item.id === input.dataset.group);
      const nodes = allNodes(row), count = nodes.filter(node => chosen.has(key(row, node))).length;
      input.checked = nodes.length > 0 && count === nodes.length;
      input.indeterminate = count > 0 && count < nodes.length;
    });
  }
  function makeTable(period) {
    const rows = snapshot.rows.filter(row => row.period === period.id);
    if (!rows.length) return null;
    const table = element('table', 'forecast__table');
    table.setAttribute('aria-label', period.id === 'short' ? 'Ближайший прогноз инцидентов' : 'Долгосрочный прогноз инцидентов');
    table.innerHTML = `<colgroup><col class="forecast__number-col"><col class="forecast__type-col">${period.horizons.map(() => '<col>').join('')}</colgroup><thead><tr><th><span class="visually-hidden">Номер</span></th><th scope="col">Тип</th>${period.labels.map(label => `<th scope="col" class="forecast__horizon">${label}</th>`).join('')}</tr></thead><tbody></tbody>`;
    const body = table.querySelector('tbody');
    rows.forEach((row, index) => {
      const expanded = selected?.id === row.id;
      const danger = period.horizons.some(hour => row.horizons[hour]?.severity === 'danger');
      const tr = element('tr', `forecast__row${danger ? ' forecast__row--danger' : ''}`);
      tr.append(element('td', 'forecast__number', period.id === 'short' ? index + 1 : index === 0 ? 1 : 3));
      const heading = element('th', 'forecast__label'); heading.scope = 'row';
      const label = element('div', 'forecast__type');
      const toggle = element('button', 'forecast__toggle', expanded ? '⌄' : '›');
      toggle.type = 'button'; toggle.setAttribute('aria-label', row.title); toggle.setAttribute('aria-expanded', String(expanded)); toggle.dataset.row = row.id; toggle.dataset.hour = period.horizons.at(-1);
      const group = checkbox(`Выбрать все: ${row.title}`, false, checked => { allNodes(row).forEach(node => checked ? chosen.add(key(row, node)) : chosen.delete(key(row, node))); render(); });
      group.dataset.group = row.id; group.disabled = allNodes(row).length === 0;
      label.append(toggle, group, element('span', '', row.title)); heading.append(label); tr.append(heading);
      period.horizons.forEach(hour => {
        const td = element('td', 'forecast__cell'), cell = row.horizons[hour];
        if (cell === null) { td.textContent = '-'; td.setAttribute('aria-label', `${hour}: нет данных`); }
        else {
          const button = element('button', 'forecast__count', cell.value);
          button.type = 'button'; button.dataset.row = row.id; button.dataset.hour = hour;
          button.setAttribute('aria-label', `${row.title}: ${cell.value}`); button.setAttribute('aria-expanded', String(expanded && selected.hour === hour));
          button.style.setProperty('--level', `${Math.min(20, Math.max(0, cell.value)) * 5}%`);
          td.append(button);
        }
        tr.append(td);
      });
      body.append(tr);
      if (expanded) {
        (row.horizons[selected.hour]?.nodes ?? []).forEach(node => {
          const detail = element('tr', 'forecast__detail'); detail.append(element('td', 'forecast__number'));
          const name = element('td', 'forecast__label'), nodeLabel = element('label', 'forecast__type forecast__type--node');
          const input = checkbox(`Пикет ${node.picket} · ${node.district}`, chosen.has(key(row, node)), checked => { checked ? chosen.add(key(row, node)) : chosen.delete(key(row, node)); updateGroups(); });
          input.dataset.node = key(row, node); nodeLabel.append(input, element('span', '', `Пикет ${node.picket} · ${node.district}`)); name.append(nodeLabel);
          const target = element('td', 'forecast__target'); target.colSpan = period.horizons.length;
          const link = element('button', 'forecast__link', 'Перейти к пикету'); link.type = 'button'; link.append(element('span', '', '›'));
          link.addEventListener('click', () => { onOpenPicket?.(node, { snapshot, incidentId: row.id, horizon: selected.hour }); dialog.close(); });
          target.append(link); detail.append(name, target); body.append(detail);
        });
      }
    });
    return table;
  }
  function render() {
    tables.replaceChildren(); threshold.hidden = false;
    dialog.querySelector('.forecast__confidence').textContent = snapshot.confidenceThreshold.toFixed(2);
    status.hidden = snapshot.rows.length > 0; status.textContent = 'Прогнозов пока нет';
    forecastPeriods.forEach(period => { const table = makeTable(period); if (table) tables.append(table); });
    updateGroups();
  }
  async function refresh() {
    request?.abort(); request = new AbortController(); const current = ++revision;
    tables.hidden = true; threshold.hidden = true; retry.hidden = true; status.hidden = false; status.textContent = 'Загрузка прогноза…';
    try {
      const data = normalizeForecast(await service.load({ signal: request.signal }));
      if (current !== revision || lifecycle.signal.aborted) return;
      snapshot = storeForecastSnapshot(data); tables.hidden = false; render();
    } catch (error) {
      if (current !== revision || lifecycle.signal.aborted || error.name === 'AbortError') return;
      status.textContent = 'Не удалось загрузить прогноз. Попробуйте ещё раз.'; retry.hidden = false;
    }
  }
  const options = { signal: lifecycle.signal };
  dialog.querySelector('.forecast__close').addEventListener('click', () => dialog.close(), options);
  retry.addEventListener('click', refresh, options);
  tables.addEventListener('click', event => {
    const button = event.target.closest('[data-row]'); if (!button) return;
    const id = button.dataset.row, hour = Number(button.dataset.hour), isToggle = button.classList.contains('forecast__toggle');
    selected = selected?.id === id && (isToggle || selected.hour === hour) ? null : { id, hour };
    render();
  }, options);
  // Демонстрационная кнопка намеренно не выполняет сетевых действий.
  dialog.querySelector('[data-action="notify"]').addEventListener('click', event => event.preventDefault(), options);
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); }, options);
  dialog.addEventListener('close', () => { request?.abort(); revision += 1; opener?.focus(); }, options);
  return {
    open() { if (dialog.open) return; opener = document.activeElement; dialog.showModal(); dialog.querySelector('h2').focus(); refresh(); },
    refresh,
    setData(data) { request?.abort(); revision += 1; snapshot = storeForecastSnapshot(data); retry.hidden = true; tables.hidden = false; render(); },
    destroy() { request?.abort(); dialog.close(); lifecycle.abort(); dialog.remove(); },
  };
}

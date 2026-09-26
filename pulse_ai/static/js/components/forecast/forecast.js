import { forecastHorizons, normalizeForecast } from '../../services/forecast.js';

export function mountForecast({ service, onOpenPicket, onNotify, onCreateRequest }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'forecast';
  dialog.id = 'forecast-dialog';
  dialog.setAttribute('aria-labelledby', 'forecast-title');
  dialog.innerHTML = `
    <header class="forecast__header">
      <h2 class="forecast__title" id="forecast-title" tabindex="-1">Прогноз инцидентов</h2>
      <p class="forecast__threshold" hidden>ТОЧНОСТЬ МОДЕЛИ <span class="forecast__confidence">0.58</span></p>
      <button class="forecast__close" type="button" aria-label="Закрыть прогноз инцидентов" title="Закрыть">×</button>
    </header>
    <p class="forecast__status" role="status" hidden></p>
    <button class="forecast__retry" type="button" hidden>Повторить загрузку</button>
    <div class="forecast__scroll">
      <table class="forecast__table" aria-label="Прогноз инцидентов по горизонтам" hidden>
        <colgroup><col class="forecast__number-col"><col class="forecast__type-col"><col><col><col></colgroup>
        <thead><tr><th><span class="visually-hidden">Номер</span></th><th scope="col">Тип</th><th scope="col" class="forecast__horizon">Статус<br><span>1 ч</span></th><th scope="col" class="forecast__horizon">Статус<br><span>6 ч</span></th><th scope="col" class="forecast__horizon">Статус<br><span>24 ч</span></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <footer class="forecast__footer">
      <button class="forecast__action" data-action="notify" type="button">Уведомить техников <span aria-hidden="true">→</span></button>
    </footer>`;
  document.body.append(dialog);
  const body = dialog.querySelector('tbody');
  const table = dialog.querySelector('table');
  const status = dialog.querySelector('.forecast__status');
  const retry = dialog.querySelector('.forecast__retry');
  const threshold = dialog.querySelector('.forecast__threshold');
  const lifecycle = new AbortController();
  const chosen = new Set();
  let request, opener, snapshot;
  let revision = 0;
  let selected = { id: 'fire', hour: 24 };
  const key = (row, node) => JSON.stringify([row.id, node.node, node.picket, node.district]);
  const allNodes = row => [...new Map(forecastHorizons.flatMap(hour => row.horizons[hour]?.nodes ?? []).map(node => [key(row, node), node])).values()];
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  function checkbox(label, checked, change) {
    const input = element('input', 'forecast__checkbox');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => change(input.checked));
    return input;
  }
  function updateGroups() {
    body.querySelectorAll('[data-group]').forEach(input => {
      const row = snapshot.rows.find(row => row.id === input.dataset.group);
      const nodes = allNodes(row);
      const count = nodes.filter(node => chosen.has(key(row, node))).length;
      input.checked = nodes.length > 0 && count === nodes.length;
      input.indeterminate = count > 0 && count < nodes.length;
    });
  }
  function render() {
    body.replaceChildren();
    threshold.hidden = false;
    dialog.querySelector('.forecast__confidence').textContent = `0.58%`;
    table.hidden = snapshot.rows.length === 0;
    status.hidden = snapshot.rows.length > 0;
    status.textContent = 'Прогнозов пока нет';
    snapshot.rows.forEach((row, index) => {
      const expanded = selected?.id === row.id;
      const tr = element('tr', 'forecast__row');
      tr.append(element('td', 'forecast__number', index + 1));
      const heading = element('th', 'forecast__label');
      heading.scope = 'row';
      const label = element('div', 'forecast__type');
      const toggle = element('button', 'forecast__toggle', expanded ? '⌄' : '›');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', row.title);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.dataset.row = row.id;
      toggle.dataset.hour = 24;
      const group = checkbox(`Выбрать все: ${row.title}`, false, checked => {
        allNodes(row).forEach(node => checked ? chosen.add(key(row, node)) : chosen.delete(key(row, node)));
        body.querySelectorAll('[data-node]').forEach(input => { input.checked = chosen.has(input.dataset.node); });
        updateGroups();
      });
      group.dataset.group = row.id;
      group.disabled = allNodes(row).length === 0;
      label.append(toggle, group, element('span', '', row.title));
      heading.append(label);
      tr.append(heading);
      const maxCount = Math.max(1, ...forecastHorizons.map(hour => row.horizons[hour]?.nodes.length ?? 0));
      for (const hour of forecastHorizons) {
        const td = element('td', 'forecast__cell');
        const cell = row.horizons[hour];
        if (cell === null) {
          td.textContent = '—';
          td.setAttribute('aria-label', `${hour} ч: нет данных`);
        } else {
          const button = element('button', 'forecast__count', cell.nodes.length);
          button.type = 'button';
          button.dataset.row = row.id;
          button.dataset.hour = hour;
          button.setAttribute('aria-label', `${row.title}, ${hour} ч: ${cell.nodes.length} узлов`);
          button.setAttribute('aria-expanded', String(expanded && selected.hour === hour));
          button.style.setProperty('--level', `${cell.nodes.length ? 2 + 13 * cell.nodes.length / maxCount : 0}px`);
          td.append(button);
        }
        tr.append(td);
      }
      body.append(tr);
      if (expanded) {
        (row.horizons[selected.hour]?.nodes ?? []).forEach(node => {
          const detail = element('tr', 'forecast__detail');
          detail.append(element('td', 'forecast__number'));
          const name = element('td', 'forecast__label');
          const nodeLabel = element('label', 'forecast__type forecast__type--node');
          const input = checkbox(`Пикет ${node.picket} · ${node.district}`, chosen.has(key(row, node)), checked => {
            checked ? chosen.add(key(row, node)) : chosen.delete(key(row, node));
            updateGroups();
          });
          input.dataset.node = key(row, node);
          nodeLabel.append(input, element('span', '', `Пикет ${node.picket} · ${node.district}`));
          name.append(nodeLabel);
          const target = element('td', 'forecast__target');
          target.colSpan = 3;
          const link = element('button', 'forecast__link', 'Перейти к пикету');
          link.type = 'button';
          link.append(element('span', '', '›'));
          link.addEventListener('click', () => {
            if (onOpenPicket) { onOpenPicket(node); dialog.close(); }
            else { status.hidden = false; status.textContent = `Карточка пикета ${node.picket} недоступна.`; }
          });
          target.append(link);
          detail.append(name, target);
          body.append(detail);
        });
      }
    });
    updateGroups();
  }
  async function refresh() {
    request?.abort();
    request = new AbortController();
    const current = ++revision;
    table.hidden = true;
    threshold.hidden = true;
    retry.hidden = true;
    status.hidden = false;
    status.textContent = 'Загрузка прогноза…';
    table.setAttribute('aria-busy', 'true');
    try {
      const data = normalizeForecast(await service.load({ signal: request.signal }));
      if (current !== revision || lifecycle.signal.aborted) return;
      snapshot = data;
      render();
    } catch (error) {
      if (current !== revision || lifecycle.signal.aborted || error.name === 'AbortError') return;
      status.textContent = 'Не удалось загрузить прогноз. Попробуйте ещё раз.';
      retry.hidden = false;
    } finally {
      if (current === revision) table.removeAttribute('aria-busy');
    }
  }
  const options = { signal: lifecycle.signal };
  dialog.querySelector('.forecast__close').addEventListener('click', () => dialog.close(), options);
  retry.addEventListener('click', refresh, options);
  body.addEventListener('click', event => {
    const button = event.target.closest('[data-row]');
    if (!button) return;
    const { row: id, hour } = button.dataset;
    const isToggle = button.classList.contains('forecast__toggle');
    selected = selected?.id === id && (isToggle || selected.hour === Number(hour)) ? null : { id, hour: Number(hour) };
    render();
    [...body.querySelectorAll(isToggle ? '.forecast__toggle' : '.forecast__count')].find(item => item.dataset.row === id && item.dataset.hour === hour)?.focus({ preventScroll: true });
  }, options);
  dialog.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    const items = snapshot?.rows.flatMap(row => allNodes(row).filter(node => chosen.has(key(row, node))).map(node => ({ incident: row.id, ...node }))) ?? [];
    status.hidden = false;
    if (!items.length) { status.textContent = 'Выберите пикеты для продолжения.'; return; }
    const action = button.dataset.action === 'notify' ? onNotify : onCreateRequest;
    if (!action) { status.textContent = button.dataset.action === 'notify' ? 'Отправка уведомлений техникам недоступна.' : 'Создание заявок недоступно.'; return; }
    button.disabled = true;
    try { await action(items); status.textContent = 'Готово.'; }
    catch { status.textContent = 'Не удалось выполнить действие. Попробуйте ещё раз.'; }
    finally { button.disabled = false; }
  }, options));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }, options);
  dialog.addEventListener('close', () => { request?.abort(); revision += 1; opener?.focus(); }, options);
  return {
    open() {
      if (dialog.open) return;
      opener = document.activeElement;
      dialog.showModal();
      dialog.querySelector('h2').focus();
      refresh();
    },
    refresh,
    setData(data) {
      const validated = normalizeForecast(data);
      request?.abort();
      revision += 1;
      snapshot = validated;
      retry.hidden = true;
      table.removeAttribute('aria-busy');
      render();
    },
    destroy() { request?.abort(); dialog.close(); lifecycle.abort(); dialog.remove(); },
  };
}

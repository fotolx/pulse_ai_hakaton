import { equipmentConfig } from '../data/equipment-config.js';
import { createEquipmentService, normalizeEquipment } from '../services/equipment.js';
import { mountEquipmentChart } from '../components/equipment-charts.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const icon = name => ({
  search: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg>',
  expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8 2v10M4.5 8.5 8 12l3.5-3.5"/></svg>',
  collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M8 14V4M4.5 7.5 8 4l3.5 3.5"/></svg>',
}[name] || '');
const designPicketIds = ['101', '102', '103', '104', '105', '106'];
export default {
  title: 'Реестр оборудования',
  render: () => `<div class="equipment">
    <aside class="equipment__tree" aria-label="Выбор оборудования">
      <div class="equipment__search"><label>${icon('search')}<input type="search" placeholder="Поиск" aria-label="Поиск станции или пикета"></label><button type="button" data-tree="expand" aria-label="Развернуть все пикеты" title="Развернуть все">${icon('expand')}</button><button type="button" data-tree="collapse" aria-label="Свернуть все пикеты" title="Свернуть все">${icon('collapse')}</button></div>
      <nav data-equipment-tree aria-label="Станции и пикеты"></nav>
    </aside>
    <section class="equipment__main" aria-label="Оборудование пикета">
      <div class="equipment__status" role="status"><span data-status>Загрузка данных…</span><button type="button" data-retry hidden>Повторить</button></div>
      <div data-equipment-content></div>
    </section>
    <aside class="equipment__summary" aria-label="Сводка по пикету" data-equipment-summary></aside>
    <dialog class="equipment__viewer" aria-labelledby="equipment-viewer-title"><header><h2 id="equipment-viewer-title"></h2><button type="button" data-close aria-label="Закрыть просмотр">×</button></header><div data-viewer-content></div></dialog>
  </div>`,
  mount(root) {
    const lifecycle = new AbortController();
    const options = { signal: lifecycle.signal };
    const service = createEquipmentService(equipmentConfig);
    const tree = root.querySelector('[data-equipment-tree]');
    const content = root.querySelector('[data-equipment-content]');
    const summary = root.querySelector('[data-equipment-summary]');
    const search = root.querySelector('input[type="search"]');
    const status = root.querySelector('[data-status]');
    const retry = root.querySelector('[data-retry]');
    const viewer = root.querySelector('dialog');
    const crumb = document.createElement('li');
    crumb.className = 'header__area equipment__breadcrumb';
    const crumbLabel = document.createElement('span');
    crumbLabel.className = 'header__area-link header__area-link--active';
    crumb.append(crumbLabel);
    document.querySelector('.header__areas').append(crumb);
    let snapshot, selected = null, charts = [], request, timer, generation = 0;
    const expanded = new Set();
    const disposeCharts = () => { charts.forEach(chart => chart.dispose()); charts = []; };
    const selectionKey = (station, picket) => JSON.stringify([station.id, picket.id]);
    function current() {
      for (const station of snapshot?.stations || []) {
        const picket = station.pickets.find(item => selectionKey(station, item) === selected);
        if (picket) return { station, picket };
      }
      return null;
    }
    function renderTree() {
      const query = search.value.trim().toLocaleLowerCase('ru');
      // The page shows the tree of the station whose equipment is open.
      const activeStation = current()?.station;
      tree.innerHTML = (activeStation ? [activeStation] : []).map(station => {
        const available = new Map(station.pickets.map(picket => [picket.id, picket]));
        const pickets = designPicketIds.map(id => available.get(id) || { id, unavailable: true }).filter(picket => `${station.name} Пикет №${picket.id}`.toLocaleLowerCase('ru').includes(query));
        if (!pickets.length) return '';
        return `<section class="equipment__station"><h2>${escape(station.name)}</h2>${pickets.map(picket => {
          const key = selectionKey(station, picket), open = expanded.has(key);
          const disabled = picket.id === '104' && !picket.unavailable ? '' : 'disabled';
          return `<div class="equipment__branch"><div class="equipment__node"><button type="button" class="equipment__toggle" ${disabled} data-toggle="${escape(key)}" aria-expanded="${open}" aria-label="${open ? 'Свернуть' : 'Развернуть'} пикет ${escape(picket.id)}">${open ? '−' : '+'}</button><button type="button" class="equipment__select" ${disabled} data-select="${escape(key)}" ${selected === key ? 'aria-current="true"' : ''}>Пикет №${escape(picket.id)}</button></div><div class="equipment__branches" ${open ? '' : 'hidden'}><button type="button" ${disabled} data-select="${escape(key)}" data-group="key">Ключевые датчики</button><button type="button" ${disabled} data-select="${escape(key)}" data-group="additional">Дополнительные датчики</button></div></div>`;
        }).join('')}</section>`;
      }).join('') || '<p class="equipment__empty">Ничего не найдено</p>';
    }
    const sensorGroup = (sensors, group, title) => `<section class="equipment__sensor-group" id="equipment-${group}"><h3>${title}</h3><dl>${sensors.filter(sensor => sensor.group === group).map(sensor => `<div><dt>${escape(sensor.name)}</dt><dd>${escape(sensor.displayValue ?? 'Нет данных')}</dd></div>`).join('') || '<div><dt>Нет данных</dt><dd>—</dd></div>'}</dl></section>`;
    function renderPicket() {
      disposeCharts();
      const active = current();
      if (!active) { content.innerHTML = '<p class="equipment__empty">В реестре пока нет оборудования.</p>'; summary.replaceChildren(); crumbLabel.textContent = ''; return; }
      const { station, picket } = active;
      crumbLabel.textContent = station.name;
      content.innerHTML = `<div class="equipment__toolbar"><h1>Пикет № ${escape(picket.id)}</h1><div><button type="button" class="equipment__button equipment__button--outline">Подключиться к видео <span aria-hidden="true">◉</span></button><button type="button" class="equipment__button">Открыть мнемокарту <span aria-hidden="true">↗</span></button></div></div>
        <div class="equipment__photos">${picket.photos.map((photo, index) => `<button type="button" data-photo="${index}" aria-label="Открыть фото ${index + 1} пикета ${escape(picket.id)}"><img src="${escape(photo)}" alt="Коллектор · пикет ${escape(picket.id)}" width="200" height="165"></button>`).join('')}${picket.photos.length < 2 ? '<div class="equipment__photo-empty"><span aria-hidden="true">▧</span><span>Фото не загружено</span></div>' : ''}</div>
        <div class="equipment__columns"><section class="equipment__live"><h2>Реальное время</h2>${sensorGroup(picket.sensors, 'key', 'Ключевые датчики')}${sensorGroup(picket.sensors, 'additional', 'Дополнительные датчики')}</section>
        <section class="equipment__forecast"><h2>Прогноз</h2><div class="equipment__legend"><span>История</span><span>Сейчас</span><span>Прогноз</span></div><div class="equipment__charts">${picket.sensors.filter(sensor => sensor.group === 'key').map((sensor, index) => `<figure class="equipment__chart"><figcaption><span>${escape(sensor.name)}</span><strong class="equipment__reading equipment__reading--${sensor.severity}">${escape(sensor.displayValue ?? 'Нет данных')}</strong></figcaption>${sensor.chart ? `<div class="equipment__plot"><div class="equipment__bands" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="equipment__canvas" data-chart="${index}" role="img" aria-label="${escape(sensor.name)}: история за 24, 6 и 1 час, текущее значение, прогноз на 1, 6 и 24 часа"></div></div><div class="equipment__axis" aria-hidden="true"><span>−24ч</span><span>−6ч</span><span>−1ч</span><span>0ч</span><span>+1ч</span><span>+6ч</span><span>+24ч</span></div>` : '<p class="equipment__empty">Прогноз пока не поступил</p>'}</figure>`).join('') || '<p class="equipment__empty">Прогноз пока не поступил</p>'}</div></section></div>`;
      summary.innerHTML = `<section class="equipment__overview"><h2>Общая сводка</h2><dl><div><dt>Всего датчиков</dt><dd>${picket.summary.totalSensors}</dd></div><div><dt>Точность прогноза</dt><dd>${picket.summary.accuracy ?? '—'}</dd></div></dl></section>${picket.summary.sections.map(section => `<section class="equipment__summary-section"><header><h2>${escape(section.title)}</h2>${section.badge ? `<span class="equipment__badge equipment__badge--${section.tone}">${escape(section.badge)}</span>` : ''}</header><dl>${section.fields.map(field => `<div><dt>${escape(field.label)}</dt><dd>${escape(field.value)}</dd></div>`).join('')}</dl></section>`).join('')}`;
      let chartError = false;
      picket.sensors.filter(sensor => sensor.group === 'key').forEach((sensor, index) => {
        if (!sensor.chart) return;
        const target = content.querySelector(`[data-chart="${index}"]`);
        try { charts.push(mountEquipmentChart(target, sensor, { licenseKey: equipmentConfig.anychartLicenseKey })); }
        catch { target.textContent = 'Не удалось загрузить график'; chartError = true; }
      });
      if (chartError) { status.textContent = 'Графики недоступны. Обновите страницу; показания датчиков доступны.'; }
    }
    function accept(data) {
      if (snapshot && Date.parse(data.updatedAt) < Date.parse(snapshot.updatedAt)) return;
      snapshot = data;
      if (!current()) {
        const station = snapshot.stations.find(item => item.pickets.some(picket => picket.id === '104')) || snapshot.stations.find(item => item.pickets.length);
        const picket = station?.pickets.find(item => item.id === '104') || station?.pickets[0];
        selected = station && picket ? selectionKey(station, picket) : null;
        if (selected) expanded.add(selected);
      }
      status.textContent = '';
      retry.hidden = true;
      renderTree();
      renderPicket();
    }
    async function load() {
      clearTimeout(timer);
      request?.abort();
      const serial = ++generation;
      request = new AbortController();
      try {
        const data = await service.load({ signal: AbortSignal.any([lifecycle.signal, request.signal]) });
        if (serial === generation && !lifecycle.signal.aborted) accept(data);
      } catch (error) {
        if (lifecycle.signal.aborted || serial !== generation || request.signal.aborted) return;
        status.textContent = snapshot ? 'Связь с сервером потеряна. Показаны последние полученные данные.' : 'Не удалось загрузить данные оборудования.';
        retry.hidden = false;
      } finally {
        if (equipmentConfig.endpoint && serial === generation && !lifecycle.signal.aborted) timer = setTimeout(load, Math.max(1000, equipmentConfig.refreshMs));
      }
    }
    tree.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.toggle) {
        const key = button.dataset.toggle;
        expanded.has(key) ? expanded.delete(key) : expanded.add(key);
        renderTree();
      } else if (button.dataset.select) {
        selected = button.dataset.select; expanded.add(selected);
        renderTree(); renderPicket();
        if (button.dataset.group) root.querySelector(`#equipment-${button.dataset.group}`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, options);
    search.addEventListener('input', () => { if (snapshot) renderTree(); }, options);
    root.querySelectorAll('[data-tree]').forEach(button => button.addEventListener('click', () => {
      if (!snapshot) return;
      expanded.clear();
      if (button.dataset.tree === 'expand') snapshot.stations.forEach(station => station.pickets.filter(picket => picket.id === "104").forEach(picket => expanded.add(selectionKey(station, picket))));
      renderTree();
    }, options));
    content.addEventListener('click', event => {
      const button = event.target.closest('[data-photo]'), active = current();
      if (!button || !active) return;
      const { picket } = active;
      const title = viewer.querySelector('h2'), body = viewer.querySelector('[data-viewer-content]');
      title.textContent = `Фото · пикет № ${picket.id}`;
      body.innerHTML = `<img src="${escape(picket.photos[Number(button.dataset.photo)])}" alt="${escape(title.textContent)}">`;
      viewer.showModal();
    }, options);
    viewer.querySelector('[data-close]').addEventListener('click', () => viewer.close(), options);
    viewer.addEventListener('close', () => viewer.querySelector('[data-viewer-content]').replaceChildren(), options);
    retry.addEventListener('click', load, options);
    // WebSocket/SSE adapters can dispatch a full validated snapshot here.
    document.addEventListener('equipment:snapshot', event => {
      try { accept(normalizeEquipment(event.detail)); }
      catch { status.textContent = 'Получены некорректные данные. Сохранён предыдущий снимок.'; }
    }, options);
    load();
    return () => { lifecycle.abort(); request?.abort(); clearTimeout(timer); disposeCharts(); viewer.close(); crumb.remove(); };
  },
};

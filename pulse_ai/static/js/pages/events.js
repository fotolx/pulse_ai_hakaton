import { dateOffset, eventDateRange } from './event-dates.js';
import { createEventsService } from '../services/events.js?v=live-events-1';

const types = ['Все типы', 'Тревоги', 'Допуск', 'ТО', 'Решения', 'Связь', 'Прогноз', 'Смена'];
const moscowDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateLabel = value => new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' }).format(new Date(`${value}T12:00:00Z`));
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeClass = {Тревога:'alarm', Допуск:'access', Прогноз:'forecast', Связь:'connection', ТО:'maintenance', Смена:'shift', Решение:'decision'};

export default {
  title: 'Журнал событий',
  render() { return `<section class="events" aria-label="Журнал событий">
    <div class="events__toolbar">
      <label class="events__search"><svg class="events__search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7"/><path d="m12.5 12.5 4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><input type="search" placeholder="Поиск по пикету / тексту" aria-label="Поиск по пикету или тексту"></label>
      <div class="events__types" role="group" aria-label="Тип события">${types.map((type,i) => `<button type="button" data-type="${type}" aria-pressed="${i===0}">${type}</button>`).join('')}</div>
      <strong class="events__count" aria-live="polite"></strong>
      <label class="events__open">Статус <select aria-label="Статус события"><option value="">Все статусы</option><option>Открыто</option><option>Закрыто</option><option>Ложное</option></select></label>
      <div class="events__periods" role="group" aria-label="Период">${[['today','Сегодня'],['week','Неделя'],['month','Месяц'],['custom','Период']].map(([key,label]) => `<button type="button" data-period="${key}" aria-pressed="${key==='week'}" title="${key === 'week' ? 'Последние 7 дней' : key === 'month' ? 'Последние 30 дней' : key === 'custom' ? 'Выбрать даты' : 'Сегодня'}">${label}</button>`).join('')}</div>
      <div class="events__dates" hidden><label>С <input type="date" data-date="from"></label><label>По <input type="date" data-date="to"></label></div>
      <span class="events__range" aria-live="polite"></span>
    </div>
    <p class="events__feedback" role="status"></p><button type="button" class="events__retry" hidden>Повторить загрузку</button>
    <div class="events__head" aria-hidden="true"><span>Время</span><span>Пикет</span><span>Коллектор</span><span>Район</span><span>Округ</span><span>Тип</span><span>Описание</span><span>Источник</span><span>Статус</span></div>
    <div class="events__results"></div>
  </section>`; },
  mount(root) {
    const view = root.querySelector('.events');
    const today = moscowDate();
    const service = createEventsService();
    const lifecycle = new AbortController();
    let timer, debounce, request, revision = 0, hasData = false;
    let selectedType = 'Все типы';
    let period = 'week';
    const result = view.querySelector('.events__results');
    const count = view.querySelector('.events__count');
    const rangeLabel = view.querySelector('.events__range');
    const search = view.querySelector('input[type=search]');
    const status = view.querySelector('.events__open select');
    const feedback = view.querySelector('.events__feedback');
    const retry = view.querySelector('.events__retry');
    const dates = view.querySelector('.events__dates');
    const from = dates.querySelector('[data-date=from]');
    const to = dates.querySelector('[data-date=to]');
    from.value = dateOffset(today, 6); to.value = today;
    function renderRows(filtered) {
      const today = moscowDate();
      result.innerHTML = filtered.length ? filtered.map((row,index) => {
        const previous = filtered[index-1];
        const relative = row.date === today ? 'Сегодня' : row.date === dateOffset(today,1) ? 'Вчера' : row.date === dateOffset(today,2) ? 'Позавчера' : '';
        const heading = previous?.date === row.date ? '' : `<h2 class="events__day">${relative ? `${relative}, ` : ''}${dateLabel(row.date)}</h2>`;
        return `${heading}<article class="events__row">
          <time class="events__time" datetime="${escapeHTML(row.occurredAt)}">${row.time}</time>
          <span class="events__picket">${row.picket ? `<a href="${location.pathname.endsWith('.html') ? './pickets.html' : '/pickets/'}">Пикет ${escapeHTML(row.picket)}</a>` : '—'}</span>
          <span class="events__collector">${escapeHTML(row.collector || '—')}</span><span class="events__area">${escapeHTML(row.district || '—')}</span><span class="events__okrug">${escapeHTML(row.okrug || '—')}</span>
          <span class="events__type events__type--${typeClass[row.type] || 'other'}">${escapeHTML(row.type)}</span><span class="events__description">${escapeHTML(row.description)}</span>
          <span class="events__source">${escapeHTML(row.source)}</span><span class="events__status events__status--${row.status === 'Открыто' ? 'open' : row.status === 'Закрыто' ? 'closed' : 'other'}">${escapeHTML(row.status)}</span>
        </article>`;
      }).join('') : '<p class="events__empty">По выбранным фильтрам событий нет.</p>';
    }
    async function load() {
      clearTimeout(timer); clearTimeout(debounce); request?.abort();
      const current = ++revision;
      const range = eventDateRange(period, moscowDate(), from.value, to.value);
      if (!range.from || !range.to || range.from > range.to) {
        result.innerHTML = ''; count.textContent = ''; rangeLabel.textContent = '';
        feedback.textContent = 'Выберите корректный период: дата начала не позже даты окончания.';
        retry.hidden = true; view.removeAttribute('aria-busy'); return;
      }
      rangeLabel.textContent = `С ${dateLabel(range.from)} по ${dateLabel(range.to)} · МСК`;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      view.setAttribute('aria-busy', 'true'); retry.hidden = true;
      if (!hasData) feedback.textContent = 'Загрузка событий…';
      try {
        const data = await service.list({ ...range,
          type: selectedType === 'Все типы' ? '' : ({Тревоги:'Тревога', Решения:'Решение'}[selectedType] || selectedType),
          status: status.value, q: search.value.trim(),
        }, { signal: controller.signal });
        if (current !== revision || lifecycle.signal.aborted) return;
        renderRows(data.items); hasData = true;
        count.textContent = data.total > data.items.length ? `${data.items.length} из ${data.total} событий` : `${data.items.length} событий`;
        feedback.textContent = data.total > data.items.length || data.items.length === 500
          ? 'Показано до 500 событий. Уточните период или фильтры. Обновление каждые 5 секунд.'
          : 'Данные сервера · обновление каждые 5 секунд';
      } catch {
        if (current !== revision || lifecycle.signal.aborted) return;
        feedback.textContent = hasData ? 'Связь с журналом потеряна. Показаны последние загруженные данные.' : 'Не удалось загрузить журнал событий. Проверьте соединение и повторите попытку.';
        retry.hidden = false;
      } finally {
        clearTimeout(timeout);
        if (current === revision && !lifecycle.signal.aborted) {
          view.removeAttribute('aria-busy'); timer = setTimeout(load, 5000);
        }
      }
    }
    function changed(delay = 0) {
      clearTimeout(timer); clearTimeout(debounce); request?.abort(); revision += 1;
      hasData = false; result.innerHTML = ''; count.textContent = '';
      debounce = setTimeout(load, delay);
    }
    const options = { signal: lifecycle.signal };
    view.addEventListener('click', event => {
      const type = event.target.closest('[data-type]');
      const periodButton = event.target.closest('[data-period]');
      if (type) { selectedType = type.dataset.type; view.querySelectorAll('[data-type]').forEach(button => button.setAttribute('aria-pressed', String(button === type))); changed(); }
      if (periodButton) { period = periodButton.dataset.period; view.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button === periodButton))); dates.hidden = period !== 'custom'; changed(); }
    }, options);
    search.addEventListener('input', () => changed(300), options);
    for (const input of [status, from, to]) input.addEventListener('change', () => changed(), options);
    retry.addEventListener('click', () => load(), options);
    load();
    return () => { lifecycle.abort(); revision += 1; clearTimeout(timer); clearTimeout(debounce); request?.abort(); };
  },
};

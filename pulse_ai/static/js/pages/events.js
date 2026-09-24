import { dateOffset, eventDateRange, isWithinEventDateRange } from './event-dates.js';

const types = ['Все типы', 'Тревоги', 'ТО', 'Решения', 'Связь', 'Прогноз', 'Смена'];
const samples = [
  ['16:34','103','Тревога','Обнаружен дым','Дымовой датчик','Открыто'],
  ['16:20','105','Допуск','Допуск АРМ-Контроль активирован — Пикет 105','Диспетчер Иванов А.',''],
  ['15:58','103','Прогноз','Риск пожара превысил порог 90% на горизонте 6ч','Модель прогноза',''],
  ['15:45','108','Связь','Потеря связи с узлом','Система мониторинга','Открыто'],
  ['14:30','101','ТО','Плановое ТО завершено','Техник Сидоров П.','Закрыто'],
  ['13:10','','Смена','Смена передана: Иванов А. → Петрова С.','Диспетчер Иванов А.',''],
  ['11:05','104','Решение','Ложное срабатывание — газоанализатор','Диспетчер Иванов А.','Ложное'],
  ['09:15','101','ТО','Плановое ТО начато','Техник Сидоров П.',''],
  ['19:42','105','Прогноз','Создана превентивная заявка по 5 узлам','Диспетчер Иванов А.',''],
  ['13:10','','Смена','Смена передана: Иванов А. → Петрова С.','Диспетчер Иванов А.',''],
  ['12:00','103','Тревога','Дым — норма, тревога снята','Дымовой датчик','Ложное'],
  ['20:12','302','Тревога','Датчик затопления — вода в приямке','Датчик уровня','Закрыто'],
  ['18:40','105','Допуск','Допуск снят по завершении работ','Диспетчер Петрова С.',''],
  ['17:05','105','ТО','Замена ИБП завершена','Техник Сидоров П.','Закрыто'],
  ['15:30','201','Связь','Связь восстановлена','Система мониторинга','Закрыто'],
  ['14:02','201','Связь','Потеря связи с узлом','Система мониторинга','Закрыто'],
  ['12:10','','Смена','Смена передана: Иванов А. → Петрова С.','Диспетчер Иванов А.',''],
  ['11:20','301','ТО','Плановое ТО завершено','Техник Сидоров П.','Закрыто'],
  ['09:00','301','ТО','Плановое ТО начато','Техник Сидоров П.',''],
  ['22:15','103','Прогноз','Риск пожара превысил порог 80% на горизонте 24ч','Модель прогноза',''],
  ['19:48','108','Решение','Подтверждён выезд бригады','Диспетчер Иванов А.','Закрыто'],
  ['19:20','108','Тревога','Обнаружен дым','Дымовой датчик','Закрыто'],
  ['12:30','','Смена','Смена передана: Петрова С. → Иванов А.','Диспетчер Петрова С.',''],
  ['08:10','104','ТО','Плановое ТО завершено','Техник Сидоров П.','Закрыто'],
  ['16:45','302','Прогноз','Создана превентивная заявка по 2 узлам','Диспетчер Иванов А.','Закрыто'],
  ['14:20','201','Связь','Связь восстановлена','Система мониторинга','Закрыто'],
  ['11:35','103','Решение','Заявка передана бригаде','Диспетчер Иванов А.','Закрыто'],
  ['09:10','101','ТО','Проверка оборудования','Техник Сидоров П.','Закрыто'],
  ['17:10','105','ТО','Проверка вентиляции завершена','Техник Сидоров П.','Закрыто'],
  ['12:25','201','Связь','Потеря связи с узлом','Система мониторинга','Закрыто'],
  ['08:40','302','Прогноз','Создана превентивная заявка','Модель прогноза','Закрыто'],
  ['14:05','103','Тревога','Проверка дымового датчика','Дымовой датчик','Закрыто'],
];
const moscowDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateLabel = value => new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long' }).format(new Date(`${value}T12:00:00Z`));
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeClass = {Тревога:'alarm', Допуск:'access', Прогноз:'forecast', Связь:'connection', ТО:'maintenance', Смена:'shift', Решение:'decision'};
const district = id => ['201','104'].includes(id) ? ['Щёлковский','Гольяново'] : ['301','302'].includes(id) ? ['Сокольнический','Сокольники'] : ['Первомайский','Измайлово'];

export default {
  title: 'Журнал событий',
  render() { return `<section class="events" aria-label="Журнал событий">
    <div class="events__toolbar">
      <label class="events__search"><svg class="events__search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.7"/><path d="m12.5 12.5 4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><input type="search" placeholder="Поиск по пикету / тексту" aria-label="Поиск по пикету или тексту"></label>
      <div class="events__types" role="group" aria-label="Тип события">${types.map((type,i) => `<button type="button" data-type="${type}" aria-pressed="${i===0}">${type}</button>`).join('')}</div>
      <strong class="events__count" aria-live="polite"></strong>
      <label class="events__open"><input type="checkbox"><span class="events__switch" aria-hidden="true"></span>Только открытые</label>
      <div class="events__periods" role="group" aria-label="Период">${[['today','Сегодня'],['week','Неделя'],['month','Месяц'],['custom','Период']].map(([key,label]) => `<button type="button" data-period="${key}" aria-pressed="${key==='week'}" title="${key === 'week' ? 'Последние 7 дней' : key === 'month' ? 'Последние 30 дней' : key === 'custom' ? 'Выбрать даты' : 'Сегодня'}">${label}</button>`).join('')}</div>
      <div class="events__dates" hidden><label>С <input type="date" data-date="from"></label><label>По <input type="date" data-date="to"></label></div>
      <span class="events__range" aria-live="polite"></span>
    </div>
    <div class="events__head" aria-hidden="true"><span>Время</span><span>Пикет</span><span>Коллектор</span><span>Район</span><span>Округ</span><span>Тип</span><span>Описание</span><span>Источник</span><span>Статус</span></div>
    <div class="events__results"></div>
  </section>`; },
  mount(root) {
    const view = root.querySelector('.events');
    const today = moscowDate();
    const rows = samples.map((sample,index) => ({ date: dateOffset(today, index < 8 ? 0 : index < 11 ? 1 : index < 19 ? 2 : index < 24 ? 3 : index < 28 ? 4 : [10, 16, 28, 40][index - 28]), ...Object.fromEntries(['time','picket','type','description','source','status'].map((key,i) => [key,sample[i]])) }));
    let selectedType = 'Все типы';
    let period = 'week';
    const result = view.querySelector('.events__results');
    const count = view.querySelector('.events__count');
    const rangeLabel = view.querySelector('.events__range');
    const search = view.querySelector('input[type=search]');
    const open = view.querySelector('.events__open input');
    const dates = view.querySelector('.events__dates');
    const from = dates.querySelector('[data-date=from]');
    const to = dates.querySelector('[data-date=to]');
    from.value = dateOffset(today, 6); to.value = today;
    function renderRows() {
      const query = search.value.trim().toLocaleLowerCase('ru');
      const range = eventDateRange(period, today, from.value, to.value);
      const filtered = rows.filter(row => {
        const matchType = selectedType === 'Все типы' || row.type === ({'Тревоги':'Тревога','Решения':'Решение'}[selectedType] || selectedType);
        const searchable = [row.picket, row.type, row.description, row.source, ...district(row.picket)].join(' ').toLocaleLowerCase('ru');
        return matchType && (!open.checked || row.status === 'Открыто') && isWithinEventDateRange(row.date, range) && searchable.includes(query);
      });
      count.textContent = `${filtered.length} событий`;
      count.title = range.from && range.to ? `${range.from} — ${range.to}` : 'Выберите обе даты';
      rangeLabel.textContent = range.from && range.to ? `С ${dateLabel(range.from)} по ${dateLabel(range.to)}` : 'Выберите обе даты';
      result.innerHTML = filtered.length ? filtered.map((row,index) => {
        const previous = filtered[index-1];
        const relative = row.date === today ? 'Сегодня' : row.date === dateOffset(today,1) ? 'Вчера' : row.date === dateOffset(today,2) ? 'Позавчера' : '';
        const heading = previous?.date === row.date ? '' : `<h2 class="events__day">${relative ? `${relative}, ` : ''}${dateLabel(row.date)}</h2>`;
        const [collector,area] = district(row.picket);
        return `${heading}<article class="events__row">
          <time class="events__time" datetime="${row.date}T${row.time}">${row.time}</time>
          <span class="events__picket">${row.picket ? `<a href="./pickets.html">Пикет ${escapeHTML(row.picket)}</a>` : '—'}</span>
          <span class="events__collector">${row.picket ? collector : '—'}</span><span class="events__area">${row.picket ? area : '—'}</span><span class="events__okrug">${row.picket ? 'ВАО' : '—'}</span>
          <span class="events__type events__type--${typeClass[row.type]}">${row.type}</span><span class="events__description">${escapeHTML(row.description)}</span>
          <span class="events__source">${escapeHTML(row.source)}</span><span class="events__status events__status--${row.status === 'Открыто' ? 'open' : row.status === 'Закрыто' ? 'closed' : 'other'}">${row.status}</span>
        </article>`;
      }).join('') : '<p class="events__empty">По выбранным фильтрам событий нет.</p>';
    }
    const onClick = event => {
      const type = event.target.closest('[data-type]');
      const periodButton = event.target.closest('[data-period]');
      if (type) { selectedType = type.dataset.type; view.querySelectorAll('[data-type]').forEach(button => button.setAttribute('aria-pressed', String(button === type))); renderRows(); }
      if (periodButton) { period = periodButton.dataset.period; view.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button === periodButton))); dates.hidden = period !== 'custom'; renderRows(); view.scrollTop = 0; }
    };
    view.addEventListener('click', onClick);
    view.addEventListener('input', renderRows);
    view.addEventListener('change', renderRows);
    renderRows();
    return () => view.removeEventListener('click', onClick);
  },
};

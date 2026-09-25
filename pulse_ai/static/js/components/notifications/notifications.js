import { normalizeNotifications } from '../../services/notifications.js';

export function mountNotifications({ trigger, service, onOpenJournal }) {
  const lifecycle = new AbortController();
  const triggerBadge = document.createElement('span');
  triggerBadge.className = 'header__notification-count';
  triggerBadge.hidden = true;
  triggerBadge.setAttribute('aria-hidden', 'true');
  trigger.append(triggerBadge);
  const panel = document.createElement('section');
  panel.className = 'notifications';
  panel.id = 'notification-center';
  panel.setAttribute('popover', 'auto');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'notifications-title');
  panel.innerHTML = `<header class="notifications__header">
    <h2 class="notifications__title" id="notifications-title" tabindex="-1">Уведомления</h2>
    <span class="notifications__badge" aria-label="Непрочитанных">0</span>
    <button class="notifications__mark" type="button">Отметить прочитанными</button>
    </header>
    <p class="notifications__status" role="status" hidden></p>
    <button class="notifications__retry" type="button" hidden>Повторить загрузку</button>
    <ul class="notifications__list" aria-label="Последние уведомления"></ul>
    <footer class="notifications__footer"><a class="notifications__journal" href="/events/">Журнал событий <span aria-hidden="true">→</span></a></footer>`;
  document.body.append(panel);
  trigger.setAttribute('popovertarget', panel.id);
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const list = panel.querySelector('ul');
  const mark = panel.querySelector('.notifications__mark');
  const status = panel.querySelector('.notifications__status');
  const retry = panel.querySelector('.notifications__retry');
  let items = [];
  let loading = false;
  let marking = false;
  let request;
  let revision = 0;
  const options = { signal: lifecycle.signal };
  function position() {
    if (!panel.matches(':popover-open')) return;
    const anchor = trigger.getBoundingClientRect();
    const top = Math.min(anchor.bottom + 8, Math.max(12, innerHeight - 180));
    panel.style.maxHeight = `${innerHeight - top - 12}px`;
    panel.style.top = `${top}px`;
    panel.style.left = `${Math.max(12, Math.min(anchor.right - panel.getBoundingClientRect().width, innerWidth - panel.getBoundingClientRect().width - 12))}px`;
  }
  function relativeTime(value) {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
    return minutes < 1 ? 'сейчас' : minutes < 60 ? `${minutes} мин` : minutes < 1440 ? `${Math.floor(minutes / 60)} ч` : `${Math.floor(minutes / 1440)} дн`;
  }
  function updateTimes() {
    list.querySelectorAll('time').forEach(time => { time.textContent = relativeTime(time.dateTime); });
  }
  function render() {
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement('li');
      li.className = `notifications__item${item.readAt ? ' notifications__item--read' : ''}`;
      li.innerHTML = `<span class="notifications__dot${item.severity === 'warning' ? ' notifications__dot--warning' : item.severity === 'info' ? ' notifications__dot--info' : ''}" aria-hidden="true"></span><article><h3 class="notifications__item-title"></h3><p class="notifications__description"></p></article><time class="notifications__time"></time>`;
      li.querySelector('h3').textContent = item.title;
      li.querySelector('p').textContent = item.description;
      const time = li.querySelector('time');
      time.dateTime = item.createdAt;
      time.title = new Date(item.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      li.setAttribute('aria-label', `${item.readAt ? 'Прочитано' : 'Не прочитано'}: ${item.severity === 'warning' ? 'Требует проверки' : item.severity === 'info' ? 'Прибытие специалиста' : 'Тревога'}`);
      list.append(li);
    }
    updateTimes();
    const unread = items.filter(item => !item.readAt).length;
    const badge = panel.querySelector('.notifications__badge');
    badge.textContent = unread;
    badge.hidden = unread === 0;
    badge.setAttribute('aria-label', `Непрочитанных: ${unread}`);
    triggerBadge.textContent = String(unread);
    triggerBadge.hidden = unread === 0;
    trigger.setAttribute('aria-label', `Уведомления, непрочитанных: ${unread}`);
    trigger.title = `Уведомления, непрочитанных: ${unread}`;
    mark.disabled = !unread || marking || loading;
    if (!items.length && !loading) { status.textContent = 'Новых уведомлений пока нет'; status.hidden = false; }
    position();
  }
  async function refresh() {
    request?.abort();
    request = new AbortController();
    const current = ++revision;
    loading = true;
    status.textContent = 'Загрузка уведомлений…';
    status.hidden = false;
    retry.hidden = true;
    mark.disabled = true;
    panel.setAttribute('aria-busy', 'true');
    try {
      const response = await service.list({ signal: request.signal });
      if (current !== revision || lifecycle.signal.aborted) return;
      items = normalizeNotifications(response);
      status.hidden = true;
    } catch (error) {
      if (current !== revision || lifecycle.signal.aborted || error.name === 'AbortError') return;
      status.textContent = 'Не удалось загрузить уведомления. Попробуйте ещё раз.';
      status.hidden = false;
      retry.hidden = false;
    } finally {
      if (current === revision && !lifecycle.signal.aborted) {
        loading = false;
        panel.removeAttribute('aria-busy');
        const message = status.textContent;
        const failed = !retry.hidden;
        render();
        if (failed) status.textContent = message;
      }
    }
  }
  mark.addEventListener('click', async () => {
    if (marking || loading) return;
    const ids = items.filter(item => !item.readAt).map(item => item.id);
    if (!ids.length) return;
    marking = true;
    mark.disabled = true;
    mark.textContent = 'Сохранение…';
    try {
      const result = await service.markRead(ids, { signal: lifecycle.signal });
      if (lifecycle.signal.aborted) return;
      items = items.map(item => result.ids.includes(item.id) ? { ...item, readAt: result.readAt } : item);
      status.textContent = 'Уведомления отмечены прочитанными';
      status.hidden = false;
    } catch (error) {
      if (lifecycle.signal.aborted) return;
      status.textContent = 'Не удалось отметить уведомления. Повторите попытку.';
      status.hidden = false;
    } finally {
      marking = false;
      if (!lifecycle.signal.aborted) { mark.textContent = 'Отметить прочитанными'; render(); }
    }
  }, options);
  retry.addEventListener('click', refresh, options);
  panel.addEventListener('toggle', event => {
    trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'open') {
      position();
      panel.querySelector('h2').focus({ preventScroll: true });
      if (!marking) refresh();
    }
  }, options);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); panel.hidePopover(); trigger.focus(); }
  }, options);
  panel.querySelector('a').addEventListener('click', event => {
    event.preventDefault();
    panel.hidePopover();
    onOpenJournal?.();
  }, options);
  window.addEventListener('resize', position, options);
  window.addEventListener('scroll', position, { ...options, capture: true });
  const timer = setInterval(updateTimes, 60000);
  // Вызывать для полного снимка от API или обновлений из WebSocket/SSE.
  function setItems(nextItems) {
    const validated = normalizeNotifications(nextItems);
    request?.abort();
    revision += 1;
    items = validated;
    loading = false;
    panel.removeAttribute('aria-busy');
    status.hidden = true;
    retry.hidden = true;
    render();
  }
  return { refresh, setItems, upsert(item) { setItems([...items.filter(existing => existing.id !== item.id), item]); },
    destroy() {
      lifecycle.abort(); request?.abort(); clearInterval(timer);
      panel.remove();
      triggerBadge.remove();
      ['popovertarget', 'aria-controls', 'aria-haspopup', 'aria-expanded'].forEach(name => trigger.removeAttribute(name));
      trigger.setAttribute('aria-label', 'Уведомления');
      trigger.title = 'Уведомления';
    },
  };
}

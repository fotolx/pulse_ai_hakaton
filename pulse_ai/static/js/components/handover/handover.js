import { handoverSummary } from '../../data/handover.js';
import { saveHandover } from '../../services/handover.js';

export function mountHandover({ summary = handoverSummary, save = saveHandover } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'handover';
  dialog.setAttribute('aria-labelledby', 'handover-title');
  dialog.setAttribute('aria-describedby', 'handover-meta');
  dialog.innerHTML = `
    <form class="handover__form">
      <header class="handover__header">
        <h2 class="handover__title" id="handover-title">Передача смены</h2>
        <p class="handover__meta" id="handover-meta"></p>
        <button class="handover__close" type="button" aria-label="Закрыть передачу смены" title="Закрыть">×</button>
      </header>
      <section class="handover__section" aria-labelledby="handover-alerts-title">
        <h3 class="handover__heading" id="handover-alerts-title"></h3>
        <ul class="handover__alerts"></ul>
      </section>
      <section class="handover__section handover__section--situation" aria-labelledby="handover-situation-title">
        <h3 class="handover__heading" id="handover-situation-title">Общая обстановка</h3>
        <dl class="handover__summary">
          <div class="handover__row"><dt>Узлов без связи</dt><dd class="handover__metric handover__metric--danger" data-field="offline"></dd></div>
          <div class="handover__row"><dt>Допуск на работы активен</dt><dd class="handover__metric handover__metric--info" data-field="permits"></dd></div>
          <div class="handover__row"><dt>Плановых ТО на сегодня</dt><dd class="handover__metric handover__metric--warning" data-field="maintenance"></dd></div>
        </dl>
      </section>
      <section class="handover__note">
        <label class="handover__heading handover__label" for="handover-note">Заметка для следующей смены</label>
        <textarea class="handover__textarea" id="handover-note" name="note" rows="2" maxlength="1000" aria-describedby="handover-help handover-count" placeholder="Кластер на Первомайском — уже 40 мин, бригада выехала в 19:45, ETA 20:15. Узел 401 — вероятно ложное, жду подтверждения от техника."></textarea>
        <div class="handover__note-footer"><p class="handover__hint" id="handover-help">Начните вводить текст, а формат подстроится автоматически</p><output class="handover__count" id="handover-count" for="handover-note">0/1000</output></div>
      </section>
      <p class="handover__status" role="status" hidden></p>
      <footer class="handover__footer"><button class="handover__submit" type="submit">Передать смену</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const textarea = dialog.querySelector('textarea');
  const submit = dialog.querySelector('.handover__submit');
  const closeButton = dialog.querySelector('.handover__close');
  const status = dialog.querySelector('.handover__status');
  let pending = false;
  let saved = false;
  let opener;
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  dialog.querySelector('.handover__meta').textContent = `${summary.from} → ${summary.to} · ${date.format(new Date(summary.scheduledAt)).replace(',', '')}`;
  dialog.querySelector('#handover-alerts-title').textContent = `Открытые тревоги (${summary.alertsTotal})`;
  summary.alerts.forEach(alert => {
    const item = document.createElement('li');
    item.className = 'handover__alert';
    const title = document.createElement('p');
    title.className = 'handover__alert-title';
    title.textContent = alert.title;
    const description = document.createElement('p');
    description.className = 'handover__alert-description';
    description.textContent = alert.description;
    item.append(title, description);
    dialog.querySelector('.handover__alerts').append(item);
  });
  for (const key of ['offline', 'permits']) dialog.querySelector(`[data-field="${key}"]`).textContent = summary[key];
  dialog.querySelector('[data-field="maintenance"]').textContent = `${summary.maintenance} · ${summary.incompleteMaintenance} не выполнено`;

  function resizeNote() {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight + 2, 55), 180)}px`;
    dialog.querySelector('.handover__count').textContent = `${textarea.value.length}/1000`;
  }
  textarea.addEventListener('input', () => {
    resizeNote();
    if (!saved) status.hidden = true;
  });
  function close() { if (!pending) dialog.close(); }
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => opener?.focus());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    if (saved) { close(); return; }
    if (!form.reportValidity()) return;
    pending = true;
    submit.disabled = true;
    closeButton.disabled = true;
    textarea.readOnly = true;
    form.setAttribute('aria-busy', 'true');
    submit.textContent = 'Сохранение…';
    status.hidden = true;
    try {
      const result = await save({ ...summary, note: textarea.value.trim() });
      saved = true;
      status.textContent = result.message;
      status.classList.remove('handover__status--error');
      submit.textContent = 'Готово';
      dialog.dispatchEvent(new CustomEvent('handover:saved', { bubbles: true, detail: result.record }));
    } catch (error) {
      status.textContent = error.message === 'Заметка не должна превышать 1000 символов.' ? error.message : 'Не удалось сохранить сводку. Попробуйте ещё раз. Введённая заметка остаётся в форме.';
      status.classList.add('handover__status--error');
      submit.textContent = 'Повторить';
      textarea.readOnly = false;
    } finally {
      pending = false;
      submit.disabled = false;
      closeButton.disabled = false;
      form.removeAttribute('aria-busy');
      status.hidden = false;
    }
  });
  return {
    open() {
      if (dialog.open) return;
      if (saved) {
        saved = false;
        textarea.value = '';
        textarea.readOnly = false;
        status.hidden = true;
        submit.textContent = 'Передать смену';
      }
      opener = document.activeElement;
      dialog.showModal();
      // Фокус на заголовке сохраняет видимость начала окна на маленьких экранах.
      const title = dialog.querySelector('.handover__title');
      title.tabIndex = -1;
      title.focus();
      resizeNote();
    },
    destroy() { dialog.close(); dialog.remove(); },
  };
}

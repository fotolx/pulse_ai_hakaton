/** Creates a detached notification. Mounting and event wiring belong to the caller. */
export function createAlarmToast({
  title = 'Новая тревога',
  description = 'Узел 105 · Первомайский · Пожар — обнаружен дым',
  timeLabel = 'только что',
} = {}) {
  const element = document.createElement('article');
  element.className = 'alarm-toast';
  element.innerHTML = `
    <div class="alarm-toast__message" role="status" aria-atomic="true">
      <header class="alarm-toast__header">
        <span class="alarm-toast__dot" aria-hidden="true"></span>
        <h2 class="alarm-toast__title"></h2>
        <span class="alarm-toast__time"></span>
      </header>
      <p class="alarm-toast__description"></p>
    </div>
    <button class="alarm-toast__details" type="button">
      Подробнее
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
        <path d="M6.5 1.5h4v4M10.5 1.5 5 7M4.5 2.5h-3v8h8v-3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>`;
  element.querySelector('.alarm-toast__title').textContent = title;
  element.querySelector('.alarm-toast__description').textContent = description;
  element.querySelector('.alarm-toast__time').textContent = timeLabel;
  return element;
}

// Демонстрационные показания до подключения телеметрии узлов.
export function mountMapTooltip(root, { signal, canOpen }) {
  const card = document.createElement('section');
  card.className = 'map-tooltip';
  card.id = 'map-node-tooltip';
  card.hidden = true;
  card.setAttribute('aria-label', 'Показания узла');
  const icons = {
    smoke: '<path d="M7 1C8 4 3 5 4 8a3 3 0 0 0 6 0c0-1-1-2-1-3 0 2-2 2-2 1s1-3 0-5Z" fill="currentColor"/>',
    temperature: '<path d="M2 10a5 5 0 1 1 8 0M6 7l2-3" fill="none" stroke="currentColor" stroke-linecap="round"/>',
    power: '<path d="M6 0 2 7h3l-1 5 6-7H7l2-5Z" fill="currentColor"/>',
  };
  const icon = name => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${icons[name]}</svg>`;
  const readings = () => `<div class="map-tooltip__readings">
    <p>${icon('smoke')}<span>Дым</span><span>Не обнаружен</span></p>
    <p>${icon('temperature')}<span>t°</span><span>21,2°</span><span class="map-tooltip__trend">+0,3% <span aria-hidden="true">▴</span></span></p>
    <p>${icon('power')}<span>ИБП</span><span>Исправны</span></p>
  </div>`;
  card.innerHTML = `<header class="map-tooltip__header"><h2 class="map-tooltip__title">№ <span></span><i class="map-tooltip__dot" aria-label="Статус: внимание"></i></h2><button type="button" class="map-tooltip__more">Подробнее <span aria-hidden="true">→</span></button></header><div class="map-tooltip__columns">${readings()}${readings()}</div><p class="map-tooltip__message" role="status" hidden></p>`;
  root.append(card);
  let active, timer;
  const options = { signal };
  function hide() {
    clearTimeout(timer);
    active?.setAttribute('aria-expanded', 'false');
    active = null;
    card.hidden = true;
  }
  function deferHide() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!card.matches(':hover') && !card.contains(document.activeElement) && !active?.matches(':hover, :focus')) hide();
    }, 180);
  }
  function position() {
    if (!active) return;
    const point = active.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const center = point.left + point.width / 2 - bounds.left;
    const left = Math.max(8, Math.min(center - width / 2, bounds.width - width - 8));
    const above = point.top - bounds.top > height + 18;
    const top = above ? point.top - bounds.top - height - 12 : point.bottom - bounds.top + 12;
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, Math.min(top, bounds.height - height - 8))}px`;
    card.style.setProperty('--arrow-x', `${Math.max(16, Math.min(center - left, width - 16))}px`);
    card.classList.toggle('map-tooltip--above', above);
  }
  function show(point) {
    if (!canOpen()) return;
    clearTimeout(timer);
    active?.setAttribute('aria-expanded', 'false');
    active = point;
    card.querySelector('.map-tooltip__title span').textContent = point.dataset.nodeId;
    card.querySelector('.map-tooltip__message').hidden = true;
    point.setAttribute('aria-expanded', 'true');
    card.hidden = false;
    position();
  }
  card.addEventListener('pointerenter', () => clearTimeout(timer), options);
  card.addEventListener('pointerleave', deferHide, options);
  card.addEventListener('focusout', deferHide, options);
  card.querySelector('button').addEventListener('click', () => {
    const event = new CustomEvent('network:node-details', { bubbles: true, cancelable: true, detail: { nodeId: active?.dataset.nodeId } });
    if (root.dispatchEvent(event)) {
      const message = card.querySelector('.map-tooltip__message');
      message.textContent = 'Подробная информация об узле недоступна.';
      message.hidden = false;
      position();
    }
  }, options);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (card.contains(document.activeElement)) active?.focus();
      hide();
    }
  }, options);
  signal.addEventListener('abort', () => { hide(); card.remove(); }, { once: true });
  return {
    hide,
    attach(point, id) {
      point.dataset.nodeId = id;
      point.setAttribute('tabindex', '0');
      point.setAttribute('role', 'button');
      point.setAttribute('aria-label', `Узел ${id}: показания датчиков`);
      point.setAttribute('aria-controls', card.id);
      point.setAttribute('aria-expanded', 'false');
      point.addEventListener('pointerenter', () => show(point), options);
      point.addEventListener('pointerleave', deferHide, options);
      point.addEventListener('focus', () => show(point), options);
      point.addEventListener('blur', deferHide, options);
      point.addEventListener('click', () => show(point), options);
      point.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(point); card.querySelector('button').focus(); }
      }, options);
    },
  };
}

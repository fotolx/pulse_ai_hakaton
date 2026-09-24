let nextLegendId = 0;

export function mountLegend(root) {
  const id = `map-legend-${++nextLegendId}`;
  const controller = new AbortController();
  root.innerHTML = `<div class="legend">
    <button class="legend__toggle" type="button" aria-label="Легенда карты" title="Легенда карты" aria-expanded="false" aria-controls="${id}" popovertarget="${id}" aria-haspopup="dialog">
      <span class="legend__dot legend__dot--power" aria-hidden="true"></span><span class="legend__dot legend__dot--communication" aria-hidden="true"></span>
      <span class="legend__dot legend__dot--water" aria-hidden="true"></span><span class="legend__dot legend__dot--heat" aria-hidden="true"></span>
    </button>
    <section class="legend__panel" id="${id}" popover="auto" role="dialog" aria-labelledby="${id}-title">
      <header class="legend__header">
        <h2 class="legend__title" id="${id}-title">Легенда</h2>
        <button class="legend__close" type="button" aria-label="Свернуть легенду" title="Свернуть легенду">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M1 6h3V3M11 6H8v3M6 1v3M6 11V8" stroke="currentColor" stroke-width="1"/></svg>
        </button>
      </header>
      <ul class="legend__statuses" aria-label="Состояния узлов">
        <li class="legend__item"><span class="legend__dot legend__dot--alarm" aria-hidden="true"></span>Авария/тревога</li>
        <li class="legend__item"><span class="legend__dot legend__dot--permit" aria-hidden="true">!</span>Допуск на работы активен</li>
        <li class="legend__item"><span class="legend__dot legend__dot--online" aria-hidden="true"></span>На связи</li>
        <li class="legend__item"><span class="legend__dot legend__dot--offline" aria-hidden="true"></span>Нет связи</li>
      </ul>
      <section class="legend__systems" aria-labelledby="${id}-systems">
        <h3 class="legend__subtitle" id="${id}-systems">Инженерные системы в шахте</h3>
        <ul class="legend__system-list">
          <li class="legend__item"><span class="legend__dot legend__dot--power" aria-hidden="true"></span>Силовые</li>
          <li class="legend__item"><span class="legend__dot legend__dot--communication" aria-hidden="true"></span>Связь</li>
          <li class="legend__item"><span class="legend__dot legend__dot--water" aria-hidden="true"></span>Вода</li>
          <li class="legend__item"><span class="legend__dot legend__dot--heat" aria-hidden="true"></span>Тепло</li>
        </ul>
      </section>
    </section>
  </div>`;
  const toggle = root.querySelector('.legend__toggle');
  const panel = root.querySelector('.legend__panel');
  const closeButton = root.querySelector('.legend__close');
  const options = { signal: controller.signal };
  function position() {
    if (!panel.matches(':popover-open')) return;
    const anchor = toggle.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8))}px`;
    panel.style.top = `${Math.max(8, anchor.top - rect.height - 8)}px`;
  }
  function close() {
    if (panel.matches(':popover-open')) panel.hidePopover();
    toggle.focus();
  }
  closeButton.addEventListener('click', close, options);
  panel.addEventListener('toggle', event => {
    toggle.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'open') {
      position();
      closeButton.focus({ preventScroll: true });
    }
  }, options);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }, options);
  window.addEventListener('resize', position, options);
  window.addEventListener('scroll', position, { ...options, capture: true });
  const observer = new ResizeObserver(position);
  observer.observe(root);
  return {
    destroy() {
      controller.abort();
      observer.disconnect();
      if (panel.matches(':popover-open')) panel.hidePopover();
      root.replaceChildren();
    },
  };
}


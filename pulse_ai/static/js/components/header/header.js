const icons = new URL('../../../img/icons/', import.meta.url);
const icon = (name, width, height) => `<img src="${icons}${name}.svg" width="${width}" height="${height}" alt="" aria-hidden="true">`;

export function mountHeader(root, { onNotice }) {
  root.innerHTML = `
    <header class="header">
      <div class="header__top">
        <div class="header__mobile-bar"><button class="header__menu-toggle" type="button" aria-label="Открыть меню" aria-controls="header-navigation" aria-expanded="false"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button><span class="header__mobile-title">Разделы сервиса</span></div>
        <nav class="header__navigation" id="header-navigation" aria-label="Основные разделы">
          <ul class="header__links">
            <li><a class="header__link" data-section="overview" href="/index.html#/district">Обзор/Карта</a></li>
            <li><a class="header__link" href="/events.html" data-section="events">Журнал событий</a></li>
            <li><a class="header__link" href="/equipment.html" data-section="equipment">Реестр оборудования</a></li>
            <li><button class="header__link" type="button" data-notice="forecast" aria-haspopup="dialog" aria-controls="forecast-dialog">Прогноз инцидентов</button></li>
          </ul>
        </nav>
        <div class="header__session">
          <time class="header__clock"></time>
          <p class="header__operator">Диспетчер ОДС · Иванов А.</p>
          <button class="header__handover" type="button" data-notice="handover">Передать смену ${icon('IconEye', 12, 12)}</button>
        </div>
      </div>
      <div class="header__bottom">
        <nav aria-label="Масштаб обзора">
          <ul class="header__areas">
            <li class="header__area"><span class="header__area-link" aria-disabled="true">Город</span></li>
            <li class="header__area"><a class="header__area-link" href="/index.html#/district/" data-route="/district">Административный округ</a></li>
            <li class="header__area"><a class="header__area-link" href="/pickets.html" data-route="/pickets">Район</a></li>
          </ul>
        </nav>
        <div class="header__actions" role="group" aria-label="Инструменты">
          <button class="header__icon-button" type="button" aria-label="Настройки" title="Настройки" data-notice="settings">${icon('setting', 12, 12)}</button>
          <button class="header__icon-button" type="button" aria-label="Печать" title="Печать" data-action="print">${icon('print', 10, 10)}</button>
          <button class="header__icon-button" type="button" aria-label="Полноэкранный режим" title="Полноэкранный режим" aria-pressed="false" data-action="fullscreen"><span class="header__fullscreen" aria-hidden="true"></span></button>
          <button class="header__icon-button header__icon-button--notification" type="button" aria-label="Уведомления" title="Уведомления" data-notifications-trigger>${icon('notification', 8, 10)}</button>
        </div>
      </div>
    </header>`;

  const clock = root.querySelector('time');
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  function updateClock() {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = formatter.format(now).replace(',', '');
    clock.title = 'Московское время';
  }
  updateClock();
  const timer = window.setInterval(updateClock, 1000);
  const fullscreenButton = root.querySelector('[data-action="fullscreen"]');
  const actions = root.querySelector('.header__actions');
  const bottom = root.querySelector('.header__bottom');
  const menuButton = root.querySelector('.header__menu-toggle');
  const navigation = root.querySelector('.header__navigation');
  const setMenuOpen = open => {
    navigation.classList.toggle('header__navigation--open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  };
  menuButton.addEventListener('click', () => setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', event => {
    if (event.target.closest('a, button')) setMenuOpen(false);
  });
  const closeMenuOutside = event => {
    if (!root.querySelector('.header__top').contains(event.target)) setMenuOpen(false);
  };
  const closeMenuOnEscape = event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuButton.focus();
    }
  };
  document.addEventListener('pointerdown', closeMenuOutside);
  document.addEventListener('keydown', closeMenuOnEscape);
  function syncFullscreen() {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenButton.setAttribute('aria-label', active ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
    fullscreenButton.title = fullscreenButton.getAttribute('aria-label');
  }
  async function handleClick(event) {
    const target = event.target.closest('[data-notice], [data-action]');
    if (!target) return;
    event.preventDefault();
    if (target.dataset.notice) onNotice(target.dataset.notice);
    if (target.dataset.action === 'print') window.print();
    if (target.dataset.action === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { onNotice('fullscreen'); }
    }
  }
  root.addEventListener('click', handleClick);
  actions.addEventListener('click', event => {
    if (!root.contains(actions)) handleClick(event);
  });
  document.addEventListener('fullscreenchange', syncFullscreen);

  return {
    update(path) {
      setMenuOpen(false);
      const toolbar = document.querySelector('.events__toolbar');
      if (path === '/events' && toolbar) toolbar.append(actions);
      else bottom.append(actions);
      bottom.classList.toggle('header__bottom--events', path === '/events');
      root.querySelectorAll('[data-route], [data-section]').forEach(link => {
        const active = link.dataset.route === path || link.dataset.section === (path === '/equipment' ? 'equipment' : path === '/events' ? 'events' : path === '/forecast' ? 'forecast' : 'overview');
        const base = link.hasAttribute('data-route') ? 'header__area-link' : 'header__link';
        link.classList.toggle(`${base}--active`, active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    },
    destroy() {
      clearInterval(timer);
      root.removeEventListener('click', handleClick);
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('pointerdown', closeMenuOutside);
      document.removeEventListener('keydown', closeMenuOnEscape);
      root.replaceChildren();
    },
  };
}

import { mountHeader } from './components/header/header.js';
import home from './pages/home.js';
import district from './pages/district.js';
import pickets from './pages/pickets.js';
import equipment from './pages/equipment.js';
import scheme from './pages/scheme.js';
import { mountForecast } from './components/forecast/forecast.js';
import { createDemoForecastService } from './services/forecast.js';
import { mountHandover } from './components/handover/handover.js';
import { mountNotifications } from './components/notifications/notifications.js';
import { createDemoNotificationsService } from './services/notifications.js';
import { subscribeToArrivals } from './services/arrivals.js';
import { mountArrivalToasts } from './components/alarm-toast/arrival-toasts.js';
import { arrivalNotification } from './services/arrival-notification.js';
import { subscribeToTasks } from './services/picket-tasks.js';
import { taskNotification } from './services/task-notification.js';
import events from './pages/events.js?v=date-filters-2';

const handover = mountHandover();
const forecast = mountForecast({ service: createDemoForecastService() });

const routes = new Map([['/', home], ['/district', district], ['/pickets', pickets], ['/equipment', equipment], ['/scheme', scheme], ['/events', events]]);
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector('#main').focus();
});
const notices = {
  settings: ['Настройки', 'Настройки сервиса недоступны.'],
  fullscreen: ['Полноэкранный режим', 'Браузер не разрешил переход в полноэкранный режим.'],
};
const header = mountHeader(document.querySelector('#header-root'), {
  onNotice(key) {
    if (key === 'forecast') { forecast.open(); return; }
    if (key === 'handover') { handover.open(); return; }
    const [title, text] = notices[key];
    document.querySelector('#notice-title').textContent = title;
    document.querySelector('#notice-text').textContent = text;
    document.querySelector('#notice').showModal();
  },
});
// Remove the old browser cache; arrivals now live only in this page instance.
try {
  ['collector:notifications', 'collector:arrival-seen', 'collector:arrival-pending'].forEach(key => localStorage.removeItem(key));
} catch { /* Storage may be unavailable. */ }
const notificationService = createDemoNotificationsService();
const notifications = mountNotifications({
  trigger: document.querySelector('[data-notifications-trigger]'),
  service: notificationService,
  onOpenJournal() { location.href = new URL('/events/', location.href); },
});
notifications.setItems(notificationService.snapshot());
const arrivalToasts = mountArrivalToasts({
  onAccept(item) {
    const notifId = item.closedAt ? taskNotification(item).id : arrivalNotification(item).id;
    notificationService.markRead([notifId]);
    notifications.setItems(notificationService.snapshot());
  },
});
subscribeToArrivals({
  onArrival(item) {
    notificationService.upsert([arrivalNotification(item)]);
    notifications.setItems(notificationService.snapshot());
    arrivalToasts.show(item);
  },
});
subscribeToTasks({
  onTask(item) {
    notificationService.upsert([taskNotification(item)]);
    notifications.setItems(notificationService.snapshot());
    arrivalToasts.showTask(item);
  },
});
// Точка интеграции для транспорта WebSocket/SSE: detail содержит одно уведомление.
document.addEventListener('notifications:received', event => {
  notificationService.upsert([event.detail]);
  notifications.setItems(notificationService.snapshot());
});
let unmountPage;
function renderPage() {
  const standalone = document.body.dataset.page;
  const defaultPath = standalone ? `/${standalone}` : '/district';
  const requested = location.hash.slice(1) || defaultPath;
  if (['/pickets', '/equipment', '/events', '/scheme'].includes(requested) && requested !== `/${standalone}`) {
    location.replace(new URL(`.${requested}.html`, location.href));
    return;
  }
  if (standalone && routes.has(requested) && requested !== defaultPath) {
    location.replace(new URL(`./index.html#${requested}`, location.href));
    return;
  }
  const path = routes.has(requested) ? requested : defaultPath;
  if (standalone && requested === defaultPath && location.hash) history.replaceState(null, '', location.pathname + location.search);
  else if (requested !== path) history.replaceState(null, '', `#${path}`);
  const page = routes.get(path);
  unmountPage?.();
  const main = document.querySelector('#main');
  main.innerHTML = page.render();
  unmountPage = page.mount?.(main);
  document.title = `${page.title} — Инженерные коллекторы Москвы`;
  header.update(path);
  if (requested === '/forecast') forecast.open();
}
window.addEventListener('hashchange', () => {
  renderPage();
  document.querySelector('#main').focus();
});
renderPage();

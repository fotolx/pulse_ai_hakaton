import { mountHeader } from './components/header/header.js';
import home from './pages/home.js';
import district from './pages/district.js';
import pickets from './pages/pickets.js';
import equipment from './pages/equipment.js?v=equipment-demo-forecast-3';
import scheme from './pages/scheme.js';
import { mountForecast } from './components/forecast/forecast.js?v=equipment-demo-forecast-3';
import { mountModelSettings } from './components/model-settings/model-settings.js';
import { createDemoForecastService, startForecastSnapshotSync, storeForecastSelection } from './services/forecast.js?v=equipment-demo-forecast-3';
import { mountHandover } from './components/handover/handover.js';
import { mountNotifications } from './components/notifications/notifications.js';
import { createPersistentNotificationsService } from './services/notifications.js?v=notification-history-1';
import { subscribeToArrivals } from './services/arrivals.js?v=notification-history-1';
import { mountArrivalToasts } from './components/alarm-toast/arrival-toasts.js?v=notification-time-1';
import { arrivalNotification } from './services/arrival-notification.js?v=notification-time-1';
import { subscribeToTasks } from './services/picket-tasks.js?v=notification-history-1';
import { taskNotification } from './services/task-notification.js?v=notification-time-1';
import events from './pages/events.js?v=live-events-1';

const handover = mountHandover();
const forecastService = createDemoForecastService();
// Снимок прогноза обновляется независимо от открытия попапа.
startForecastSnapshotSync(forecastService, { intervalMs: 15000 });
const forecast = mountForecast({
  service: forecastService,
  onOpenPicket(node, context) {
    storeForecastSelection(node, context);
    const target = location.pathname.endsWith('.html') ? './equipment.html' : '/equipment/';
    location.href = `${target}?picket=${encodeURIComponent(node.picket)}`;
  },
});
const modelSettings = mountModelSettings();

const routes = new Map([['/', home], ['/district', district], ['/pickets', pickets], ['/equipment', equipment], ['/scheme', scheme], ['/events', events]]);
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector('#main').focus();
});
const notices = {
  fullscreen: ['Полноэкранный режим', 'Браузер не разрешил переход в полноэкранный режим.'],
};
const header = mountHeader(document.querySelector('#header-root'), {
  onNotice(key) {
    if (key === 'forecast') { forecast.open(); return; }
    if (key === 'handover') { handover.open(); return; }
    if (key === 'settings') { modelSettings.open(document.activeElement); return; }
    const [title, text] = notices[key];
    document.querySelector('#notice-title').textContent = title;
    document.querySelector('#notice-text').textContent = text;
    document.querySelector('#notice').showModal();
  },
});
// Server snapshots restore the full history; local storage preserves read state in this browser.
const notificationService = createPersistentNotificationsService();
const notifications = mountNotifications({
  trigger: document.querySelector('[data-notifications-trigger]'),
  service: notificationService,
  onOpenJournal() { location.href = location.pathname.endsWith('.html') ? './events.html' : '/events/'; },
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
  onSnapshot(items) {
    notificationService.upsert(items.map(arrivalNotification));
    notifications.setItems(notificationService.snapshot());
  },
  onArrival(item) {
    notificationService.upsert([arrivalNotification(item)]);
    notifications.setItems(notificationService.snapshot());
    arrivalToasts.show(item);
  },
});
subscribeToTasks({
  onSnapshot(items) {
    notificationService.upsert(items.map(taskNotification));
    notifications.setItems(notificationService.snapshot());
  },
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

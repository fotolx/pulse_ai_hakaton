import { createAlarmToast } from './alarm-toast.js';
import { arrivalNotification } from '../../services/arrival-notification.js';
import { taskNotification } from '../../services/task-notification.js';

export function mountArrivalToasts({ onAccept } = {}) {
  const region = document.createElement('aside');
  region.className = 'alarm-toast-stack';
  region.setAttribute('aria-label', 'Прибытия специалистов и закрытие задач');
  document.body.append(region);
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const visible = new Set();
  const timers = new Map();
  const api = {
    show(item) {
      if (visible.has(item.id)) return;
      visible.add(item.id);
      const notification = arrivalNotification(item);
      const toast = createAlarmToast({
        title: notification.title,
        timeLabel: time.format(new Date(item.arrivedAt)),
        description: notification.description,
      });
      toast.classList.add('alarm-toast--arrival');
      const button = toast.querySelector('button');
      button.textContent = 'Принято';
      const dismiss = () => {
        clearTimeout(timers.get(item.id));
        timers.delete(item.id);
        visible.delete(item.id);
        toast.remove();
      };
      button.addEventListener('click', () => { onAccept?.(item); dismiss(); }, { once: true });
      region.append(toast);
      timers.set(item.id, setTimeout(dismiss, 10000));
    },
    showTask(item) {
      if (visible.has(item.id)) return;
      visible.add(item.id);
      const notification = taskNotification(item);
      const toast = createAlarmToast({
        title: notification.title,
        timeLabel: time.format(new Date(item.closedAt || Date.now())),
        description: notification.description,
      });
      toast.classList.add('alarm-toast--arrival');
      const button = toast.querySelector('button');
      button.textContent = 'Принято';
      const dismiss = () => {
        clearTimeout(timers.get(item.id));
        timers.delete(item.id);
        visible.delete(item.id);
        toast.remove();
      };
      button.addEventListener('click', () => { onAccept?.(item); dismiss(); }, { once: true });
      region.append(toast);
      timers.set(item.id, setTimeout(dismiss, 10000));
    },
    destroy() { timers.forEach(clearTimeout); timers.clear(); region.remove(); },
  };
  return api;
}

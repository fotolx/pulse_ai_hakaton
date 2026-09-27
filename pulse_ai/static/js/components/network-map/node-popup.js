import { districtNode107 } from '../../data/district-node.js';
import { createLocalNodeDecisionService } from '../../services/node-decisions.js';

const external = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M6 3H3v10h10v-3"/></svg>';
const calendar = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1v4M12 1v4M2 6h12M2 3h12v11H2Z"/></svg>';
const pin = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s4-5 4-8a4 4 0 0 0-8 0c0 3 4 8 4 8Z"/><circle cx="8" cy="6" r="1"/></svg>';

export function mountNodePopup(root, { node = districtNode107, service = createLocalNodeDecisionService(), onNotify } = {}) {
  const lifecycle = new AbortController();
  const options = { signal: lifecycle.signal };
  const card = document.createElement('dialog');
  card.className = `node-popup${node.alarm ? ' node-popup--alarm' : ''}`;
  card.id = `district-node-popup-${node.id}`;
  card.setAttribute('aria-labelledby', `node-popup-title-${node.id}`);
  card.innerHTML = `
    <button class="node-popup__close" type="button" aria-label="Закрыть карточку узла">×</button>
    <header class="node-popup__header">
      <h2 id="node-popup-title-${node.id}" tabindex="-1">№ ${node.id} <span class="node-popup__dot" aria-label="Жёлтый индикатор состояния"></span></h2>
      <div class="node-popup__badges">${node.alarm ? '<span class="node-popup__badge--danger">Пожар</span>' : ''}<span>Контроль активен</span><span class="${node.alarm ? 'node-popup__badge--danger' : ''}">${node.affectedSystems} из ${node.totalSystems} подсистем</span>${node.alarm ? '<span class="node-popup__alarm-count" role="timer" aria-label="Осталось 2 минуты"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="node-popup__alarm-track" cx="12" cy="12" r="10" pathLength="100"/><circle class="node-popup__alarm-progress" cx="12" cy="12" r="10" pathLength="100"/></svg><span data-alarm-minutes>2</span></span>' : `<span class="node-popup__badge--good">${node.quietDays} дней спокоен</span>`}</div>
    </header>
    <div class="node-popup__columns">
      <div>
        <div class="node-popup__meta"><p>${calendar}<time datetime="${node.observedAt}">${node.observedLabel}</time></p><p>${pin}<span>${node.coordinates}</span></p></div>
        <section class="node-popup__section"><h3>Возраст объекта / наработка</h3><p class="node-popup__age">${node.age} · ${node.cycles} циклов</p></section>
        ${node.alarm ? '' : `<section class="node-popup__section"><h3>Плановое ТО</h3><dl class="node-popup__maintenance"><dt>Последнее ТО</dt><dd>${node.lastMaintenance} <span class="node-popup__check" aria-label="Выполнено">✓</span></dd><dt>Следующее плановое</dt><dd>${node.nextMaintenance}</dd></dl></section>`}
        <section class="node-popup__section"><h3><button class="node-popup__sensor-link" type="button" data-action="sensors">Оснащение / датчики ${node.alarm ? '' : external}</button></h3><dl class="node-popup__sensors">${node.sensors.map(sensor => `<dt>${sensor.name}</dt><dd class="${sensor.alert ? 'node-popup__danger' : ''}">${sensor.value}</dd>`).join('')}</dl></section>
      </div>
      <div class="node-popup__media">
        <button class="node-popup__photo" type="button" data-action="photo" aria-label="Увеличить фото узла ${node.id}"><img src="${node.photo}" alt="Инженерный коллектор: проход между трубопроводами" width="199" height="164"></button>
        <button class="node-popup__scheme" type="button" data-action="scheme">Открыть мнемосхему ${external}</button>
      </div>
    </div>
    ${node.alarm ? `<section class="node-popup__forecast"><h3>Прогноз</h3><p class="node-popup__danger node-popup__forecast-title">Пожар</p><p class="node-popup__factors">Ведущие факторы: дым обнаружен, рост задымления (0.86), совпадение с температурным трендом. 3 похожих случая в истории наблюдений, во всех подтверждён выезд бригады.</p><ol class="node-popup__horizons"><li><span><b>1</b> 35%</span><small>15 сек</small></li><li><span><b>2</b> 75%</span><small>1 мин</small></li><li><span><b>3</b> 100%</span><small>2 мин</small></li></ol></section>` : ''}
    <footer class="node-popup__footer"><p>Решение диспетчера — формирует эталон для дообучения модели</p><div class="node-popup__actions">${node.alarm ? '<button type="button" data-action="dispatch">Выезд бригады</button><button type="button" data-action="false-alarm">Ложное срабатывание</button><button type="button" data-action="notify">Уведомить техников</button>' : '<button type="button" data-action="maintenance" disabled>Плановое ТО</button><button type="button" data-action="close">Закрыть</button>'}</div><p class="node-popup__feedback" role="status" hidden></p></footer>`;

  const viewer = document.createElement('dialog');
  viewer.className = 'node-viewer';
  viewer.setAttribute('aria-labelledby', `node-viewer-title-${node.id}`);
  viewer.innerHTML = `<header><h2 id="node-viewer-title-${node.id}" tabindex="-1"></h2><button type="button" aria-label="Закрыть просмотр">×</button></header><div class="node-viewer__content"></div>`;
  document.body.append(card, viewer);
  const feedback = card.querySelector('.node-popup__feedback');
  const alarmCount = card.querySelector('.node-popup__alarm-count');
  const alarmMinutes = card.querySelector('[data-alarm-minutes]');
  const alarmProgress = card.querySelector('.node-popup__alarm-progress');
  let opener;
  let alarmFrame;

  function stopAlarmCountdown() {
    if (alarmFrame) cancelAnimationFrame(alarmFrame);
    alarmFrame = undefined;
  }
  function startAlarmCountdown() {
    if (!alarmCount) return;
    stopAlarmCountdown();
    const duration = 2 * 60 * 1000;
    const startedAt = performance.now();
    let announcedMinutes = 2;
    const update = now => {
      const elapsed = Math.min(now - startedAt, duration);
      const remaining = duration - elapsed;
      const minutes = Math.ceil(remaining / 60000);
      alarmMinutes.textContent = String(minutes);
      alarmProgress.style.strokeDashoffset = String(elapsed / duration * 100);
      if (minutes !== announcedMinutes) {
        announcedMinutes = minutes;
        alarmCount.setAttribute('aria-label', minutes ? `Осталось ${minutes} минута` : 'Время истекло');
      }
      if (elapsed < duration && card.open) alarmFrame = requestAnimationFrame(update);
      else alarmFrame = undefined;
    };
    alarmMinutes.textContent = '2';
    alarmProgress.style.strokeDashoffset = '0';
    alarmCount.setAttribute('aria-label', 'Осталось 2 минуты');
    alarmFrame = requestAnimationFrame(update);
  }

  function message(text) { feedback.textContent = text; feedback.hidden = false; }
  const decisionLabels = { maintenance: 'Плановое ТО', monitoring: 'Мониторинг', dispatch: 'Выезд бригады', 'false-alarm': 'Ложное срабатывание' };
  function saved(record) {
    card.querySelectorAll('.node-popup__actions button').forEach(button => {
      const selected = button.dataset.action === record.decision;
      if (button.dataset.action === "close") return;
      button.disabled = button.dataset.action === 'maintenance' || selected;
      button.setAttribute('aria-pressed', String(selected));
    });
    message('Решение «' + decisionLabels[record.decision] + '» сохранено.');
  }
  function closeCard() { if (viewer.open) viewer.close(); card.close(); }
  card.querySelector('.node-popup__close').addEventListener('click', closeCard, options);
  viewer.querySelector('button').addEventListener('click', () => viewer.close(), options);
  for (const dialog of [card, viewer]) {
    // Закрываем только если и нажатие, и отпускание произошли на фоне.
    let backdrop = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog && outside(event); }, options);
    dialog.addEventListener('click', event => { if (backdrop && event.target === dialog && outside(event)) dialog.close(); backdrop = false; }, options);
  }
  card.addEventListener('close', () => {
    stopAlarmCountdown();
    opener?.setAttribute('aria-expanded', 'false');
    if (opener?.isConnected) opener.focus();
  }, options);

  function showViewer(kind) {
    const title = viewer.querySelector('h2');
    const content = viewer.querySelector('.node-viewer__content');
    viewer.classList.toggle('node-viewer--scheme', kind === 'scheme');
    if (kind === 'photo') {
      title.textContent = `Фото узла № ${node.id}`;
      content.innerHTML = `<img class="node-viewer__photo" src="${node.photo}" alt="Инженерный коллектор узла ${node.id}"><p class="node-viewer__note">Фото из карточки объекта · ${node.observedLabel}</p>`;
    } else if (kind === 'scheme') {
      title.textContent = `Мнемосхема · узел № ${node.id}`;
      content.innerHTML = `<svg class="node-viewer__scheme" viewBox="0 0 1514 976" role="img" aria-label="Схема коллекторов района. Узел ${node.id} выделен синим кольцом."><image href="${node.scheme}" width="1514" height="976"/><circle cx="831" cy="409" r="38" fill="none" stroke="#007bd3" stroke-width="5" stroke-dasharray="9 5"/></svg><p class="node-viewer__note">Узел ${node.id} выделен синим кольцом. Дым: нет · Температура: 22.4 °C · ИБП: есть питание.</p>`;
      if (node.alarm) content.innerHTML = `<svg class="node-viewer__scheme" viewBox="0 0 1514 976" role="img" aria-label="Схема коллекторов района. Узел ${node.id} выделен красным кольцом."><image href="${node.scheme}" width="1514" height="976"/><circle cx="409" cy="231" r="40" fill="none" stroke="#ff5059" stroke-width="5" stroke-dasharray="9 5"/></svg><p class="node-viewer__note">Узел ${node.id} · Дым обнаружен · Температура: 64.2 °C · ИБП: много неисправных.</p>`;
    } else {
      title.textContent = `Оснащение и датчики · узел № ${node.id}`;
      content.innerHTML = `<p class="node-viewer__note">Показания на ${node.observedLabel}</p><table><thead><tr><th scope="col">Датчик</th><th scope="col">Показание</th></tr></thead><tbody>${node.sensors.map(sensor => `<tr><th scope="row">${sensor.name}</th><td>${sensor.value}</td></tr>`).join('')}</tbody></table>`;
    }
    viewer.showModal();
    title.focus();
  }
  card.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') { closeCard(); return; }
    if (action === 'scheme' && node.id === '107') {
      location.href = new URL('./equipment.html', location.href).href;
      return;
    }
    if (['photo', 'scheme', 'sensors'].includes(action)) showViewer(action);
    if (action === 'notify') {
      if (!onNotify) { message('Отправка уведомлений техникам недоступна.'); return; }
      const button = card.querySelector('[data-action="notify"]');
      button.disabled = true;
      try { await onNotify(node); message('Уведомление техникам отправлено.'); }
      catch { message('Не удалось уведомить техников. Попробуйте ещё раз.'); }
      finally { button.disabled = false; }
    }
    if ((!node.alarm && action === 'maintenance') || (node.alarm && ['dispatch', 'false-alarm'].includes(action))) {
      try {
        const decision = service.saveDecision(node, action);
        saved(decision);
        root.dispatchEvent(new CustomEvent('network:node-decision', { bubbles: true, detail: decision }));
      } catch {
        message('Не удалось сохранить решение. Попробуйте ещё раз.');
      }
    }
  }, options);
  root.addEventListener('network:incident-select', event => {
    if (event.detail?.nodeId !== node.id || card.open) return;
    opener = root.querySelector(`[data-node-id="${node.id}"]`);
    opener?.setAttribute('aria-expanded', 'true');
    feedback.hidden = true;
    card.querySelectorAll('.node-popup__actions [data-action]').forEach(button => {
      button.disabled = button.dataset.action === 'maintenance';
      button.removeAttribute('aria-pressed');
    });
    try { const record = service.load(node.id); if (record) saved(record); }
    catch { message('Хранилище решений недоступно. Сохранение может потребовать повторной попытки.'); }
    card.showModal();
    startAlarmCountdown();
    card.querySelector('h2').focus();
  }, options);
  return { destroy() { stopAlarmCountdown(); lifecycle.abort(); viewer.close(); card.close(); viewer.remove(); card.remove(); } };
}

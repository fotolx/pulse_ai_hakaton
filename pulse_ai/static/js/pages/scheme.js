import { mountMetrics } from '../components/metrics/metrics.js';
import { initialSchemeTelemetry, mergeSchemeTelemetry, normalizeSchemeTelemetryPatch, createHttpSchemeTelemetryService, startSchemeTelemetryPolling } from '../services/scheme-telemetry.js';

const schemeMetrics = {
  networkLength: '9 км', modelAccuracy: '0.58', averageDailyAlerts: 1,
  decisions: 1, maintenance: 0, requests: 2, activeAlerts: 2,
  offline: 1, permits: 1, highestRisk: 'Пожар · 1', atRisk: 1,
};
const canvasWidth = 1240;
const canvasHeight = 520;

const sensorPositions = [
  ['103-smoke',202,203,74,'right'],['103-motion',178,274,100,'right'],['103-state',177,346,100,'right'],
  ['103-temperature',424,241,130,'left'],['103-switch',424,314,110,'left'],
  ['104-smoke',565,203,75,'right'],['105-smoke',912,203,78,'right'],['105-ups',913,337,78,'right'],
  ['105-temperature',1136,238,104,'left'],['105-motion',1136,294,104,'left'],
  ['105-power',1136,339,104,'left'],['105-phase',1136,381,104,'left'],
];
const gauge = (label,angle) => `<div class="scheme-board__gauge"><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="40" fill="#fff"/><circle cx="42" cy="42" r="34" fill="none" stroke="#54bd72" stroke-width="5" stroke-dasharray="102 214" transform="rotate(140 42 42)"/><circle cx="42" cy="42" r="34" fill="none" stroke="#f2c94c" stroke-width="5" stroke-dasharray="32 214" stroke-dashoffset="-104" transform="rotate(140 42 42)"/><circle cx="42" cy="42" r="34" fill="none" stroke="#e45558" stroke-width="5" stroke-dasharray="32 214" stroke-dashoffset="-138" transform="rotate(140 42 42)"/><g transform="rotate(${angle} 42 42)"><line x1="42" y1="42" x2="14" y2="42" stroke="#202325" stroke-width="2"/></g><circle cx="42" cy="42" r="3" fill="#202325"/></svg><span>${label}</span></div>`;

export default {
  title: 'ПС «Первомайская» — Схема',
  render: () => `<h1 class="visually-hidden">Схема ПС «Первомайская»</h1><section class="scheme-board" aria-label="Схема сети ПС «Первомайская»"><div class="scheme-board__frame"><div class="scheme-board__size"><div class="scheme-board__surface">
    <img class="scheme-board__art" src="/static/img/map/Shema-2.svg" alt="Схема тоннеля и пикетов 104, 105 и 106"><h2 class="scheme-board__title">ПС «Первомайская»</h2><img class="scheme-board__station" src="/static/img/icons/stanciya.svg" alt="Подстанция Первомайская">
    <aside class="scheme-board__sidebar" aria-label="Электрика подстанции"><div class="scheme-board__readings"><div><b>НАГРУЗКА, %</b><small>план&nbsp;&nbsp;&nbsp; факт</small><strong data-station="load">70&nbsp;&nbsp; 62</strong></div><div><b>НАПРЯЖЕНИЕ, кВ</b><small>план&nbsp;&nbsp;&nbsp; факт</small><strong data-station="voltage">10.5&nbsp; 10.5</strong></div></div><div class="scheme-board__electric"><b>Электрика ПС</b>${gauge('Напряжение · 10.5 кВ',-12)}${gauge('Загрузка · 62%',27)}${gauge('Темп. трансф. · 41 °C',-45)}</div></aside>
    <div class="scheme-board__temperatures" aria-label="Температура линии">${[238,415,591,768,944].map((x,i) => `<span data-line="line-${i+1}" style="left:${x}px"></span>`).join('')}</div>
    <div class="scheme-board__sensors" aria-label="Текущие показания датчиков">${sensorPositions.map(([id,x,y,width,align]) => `<span class="scheme-board__sensor scheme-board__sensor--${align}" style="left:${x}px;top:${y}px;width:${width}px"><b data-sensor-label="${id}"></b><small data-sensor-value="${id}"></small></span>`).join('')}</div>
    <a class="scheme-board__picket scheme-board__picket--104" href="/equipment/">Пикет № 104 <span aria-hidden="true">↗</span></a>
    <button type="button" class="scheme-board__picket scheme-board__picket--105" data-picket-pending aria-haspopup="dialog">Пикет № 105 <span aria-hidden="true">↗</span></button>
    <button type="button" class="scheme-board__picket scheme-board__picket--106" data-picket-pending aria-haspopup="dialog">Пикет № 106 <span aria-hidden="true">↗</span></button>
  </div></div><p class="scheme-board__warning">⚠ Демонстрационный фрагмент тоннеля — в финальной версии он прокручивается по всей длине, с данными по каждому пикету</p></div>
  <dialog class="scheme-pending" aria-labelledby="scheme-pending-title"><img src="/static/img/icons/IconWrench.svg" width="32" height="32" alt=""><h2 id="scheme-pending-title">Мы уже над этим работаем —<br>скоро здесь появится<br>полноценный функционал</h2></dialog>
  <p class="scheme-board__status" role="status" hidden></p>
  <div class="scheme-board__metrics" data-metrics></div>
  </section>`,
  mount(root) {
    const board = root.querySelector('.scheme-board');
    const frame = board.querySelector('.scheme-board__frame');
    const size = board.querySelector('.scheme-board__size');
    const surface = board.querySelector('.scheme-board__surface');
    const status = board.querySelector('.scheme-board__status');
    const metrics = mountMetrics(board.querySelector('[data-metrics]'), schemeMetrics, { generalTitle: 'Общие по ПС «Первомайская»' });
    const controller = new AbortController();
    const pending = board.querySelector('.scheme-pending');
    frame.addEventListener('pointerdown', event => {
      if (event.target.closest('.scheme-board__picket')) return;
      const focused = document.activeElement;
      if (focused instanceof Element && frame.contains(focused)) focused.blur();
    }, { signal: controller.signal });
    board.querySelectorAll('[data-picket-pending]').forEach(button => {
      button.addEventListener('click', () => pending.showModal(), { signal: controller.signal });
    });
    pending.addEventListener('click', event => {
      const rect = pending.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) pending.close();
    }, { signal: controller.signal });
    let telemetry = initialSchemeTelemetry;
    function renderTelemetry() {
      for (const [id,sensor] of Object.entries(telemetry.sensors)) {
        const label = board.querySelector(`[data-sensor-label="${id}"]`);
        const value = board.querySelector(`[data-sensor-value="${id}"]`);
        const line = board.querySelector(`[data-line="${id}"]`);
        if (label) label.textContent = sensor.label ?? '';
        if (value) { value.textContent = sensor.value ?? ''; value.style.color = sensor.tone === 'danger' ? '#f05055' : sensor.tone === 'warning' ? '#f2c94c' : ''; }
        if (line) { line.textContent = sensor.value ?? ''; line.style.color = sensor.tone === 'danger' ? '#f05055' : sensor.tone === 'warning' ? '#f2c94c' : ''; }
      }
      const station = telemetry.station;
      board.querySelector('[data-station="load"]').textContent = `${station.loadPlan}    ${station.loadActual}`;
      board.querySelector('[data-station="voltage"]').textContent = `${station.voltagePlan}   ${station.voltageActual}`;
      const values = [`Напряжение · ${station.voltageActual} кВ`,`Загрузка · ${station.loadActual}%`,`Темп. трансф. · ${station.transformerTemp} °C`];
      const angles = [-12+(Number(station.voltageActual)-10.5)*30,27+(Number(station.loadActual)-62)*1.2,-45+(Number(station.transformerTemp)-41)*1.5];
      board.querySelectorAll('.scheme-board__gauge').forEach((gauge,index) => { gauge.querySelector('span').textContent = values[index]; gauge.querySelector('svg g').setAttribute('transform',`rotate(${Math.max(-80,Math.min(80,angles[index]))} 42 42)`); });
      metrics.update(telemetry.metrics);
    }
    renderTelemetry();
    const applyTelemetry = patch => {
      const normalized = normalizeSchemeTelemetryPatch(patch);
      telemetry = mergeSchemeTelemetry(telemetry,normalized);
      renderTelemetry();
      for (const id of Object.keys(normalized.sensors)) {
        const sensor = board.querySelector(`[data-sensor-value="${id}"]`);
        const line = board.querySelector(`[data-line="${id}"]`);
        if (sensor) sensor.parentElement.style.display = 'block';
        if (line) line.style.display = 'block';
      }
      status.hidden = true;
    };
    document.addEventListener('scheme:telemetry', event => {
      try { applyTelemetry(event.detail); }
      catch (error) { console.warn('Не удалось обновить схему:', error); }
    }, { signal: controller.signal });
    const telemetryUrl = document.body.dataset.schemeTelemetryUrl;
    if (telemetryUrl) {
      const configuredInterval = Number(document.body.dataset.schemeTelemetryInterval || 5000);
      const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 1000 ? configuredInterval : 5000;
      startSchemeTelemetryPolling(createHttpSchemeTelemetryService(telemetryUrl), {
        onData: applyTelemetry,
        onError: () => { status.textContent = 'Не удалось получить новые данные схемы. Повторная попытка выполняется автоматически.'; status.hidden = false; },
        intervalMs,
        signal: controller.signal,
      });
    }
    const observer = new ResizeObserver(() => {
      const scale = Math.min((frame.clientWidth-2)/canvasWidth,(frame.clientHeight-44)/canvasHeight);
      if (!Number.isFinite(scale) || scale <= 0) return;
      size.style.width = `${canvasWidth*scale}px`;
      size.style.height = `${canvasHeight*scale}px`;
      surface.style.transform = `scale(${scale})`;
    });
    observer.observe(frame);
    const modes = document.createElement('div'); modes.className = 'header__map-modes'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Вид карты'); modes.innerHTML = '<a class="header__map-mode" href="/pickets/" aria-label="Карта">Карта</a><span class="header__map-mode" aria-current="page">Схема</span>'; document.querySelector('#header-root .header__actions').prepend(modes);
    const areas = document.querySelector('#header-root .header__areas'); const item = document.createElement('li'); item.className = 'header__area'; item.innerHTML = '<span class="header__area-link header__area-link--active" aria-current="page">ПС «Первомайская»</span>'; areas.append(item);
    return () => { controller.abort(); observer.disconnect(); metrics.destroy(); modes.remove(); item.remove(); };
  },
};

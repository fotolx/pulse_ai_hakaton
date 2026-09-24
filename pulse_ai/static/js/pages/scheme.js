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
    <img class="scheme-board__art" src="./img/map/Shema-2.svg" alt="Схема тоннеля и пикетов 103, 104 и 105"><h2 class="scheme-board__title">ПС «Первомайская»</h2><img class="scheme-board__station" src="./img/icons/stanciya.svg" alt="Подстанция Первомайская">
    <aside class="scheme-board__sidebar" aria-label="Электрика подстанции"><div class="scheme-board__readings"><div><b>НАГРУЗКА, %</b><small>план&nbsp;&nbsp;&nbsp; факт</small><strong data-station="load">70&nbsp;&nbsp; 62</strong></div><div><b>НАПРЯЖЕНИЕ, кВ</b><small>план&nbsp;&nbsp;&nbsp; факт</small><strong data-station="voltage">10.5&nbsp; 10.5</strong></div></div><div class="scheme-board__electric"><b>Электрика ПС</b>${gauge('Напряжение · 10.5 кВ',-12)}${gauge('Загрузка · 62%',27)}${gauge('Темп. трансф. · 41 °C',-45)}</div></aside>
    <div class="scheme-board__temperatures" aria-label="Температура линии">${[238,415,591,768,944].map((x,i) => `<span data-line="line-${i+1}" style="left:${x}px"></span>`).join('')}</div>
    <div class="scheme-board__sensors" aria-label="Текущие показания датчиков">${sensorPositions.map(([id,x,y,width,align]) => `<span class="scheme-board__sensor scheme-board__sensor--${align}" style="left:${x}px;top:${y}px;width:${width}px"><b data-sensor-label="${id}"></b><small data-sensor-value="${id}"></small></span>`).join('')}</div>
    <a class="scheme-board__picket scheme-board__picket--103" href="./pickets.html" aria-label="Пикет № 103"></a><a class="scheme-board__picket scheme-board__picket--104" href="./pickets.html" aria-label="Пикет № 104"></a><a class="scheme-board__picket scheme-board__picket--105" href="./pickets.html" aria-label="Пикет № 105"></a>
  </div></div></div>
  <div class="network-map__controls scheme-board__controls" role="group" aria-label="Масштаб схемы">
    <button type="button" data-scheme-control="in" aria-label="Увеличить масштаб" title="Увеличить масштаб">+</button>
    <button type="button" class="network-map__zoom-value" data-scheme-control="reset" aria-label="Вернуть исходный масштаб" title="Вернуть исходный вид">100%</button>
    <button type="button" data-scheme-control="out" aria-label="Уменьшить масштаб" title="Уменьшить масштаб">−</button>
    <button type="button" data-scheme-control="expand" aria-label="Развернуть схему" title="Развернуть схему" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5-6 6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></svg></button>
  </div>
  <p class="scheme-board__status" role="status" hidden></p>
  <div class="scheme-board__metrics" data-metrics></div>
  </section>`,
  mount(root) {
    const board = root.querySelector('.scheme-board');
    const frame = board.querySelector('.scheme-board__frame');
    const size = board.querySelector('.scheme-board__size');
    const surface = board.querySelector('.scheme-board__surface');
    const controls = board.querySelector('.scheme-board__controls');
    const status = board.querySelector('.scheme-board__status');
    const metrics = mountMetrics(board.querySelector('[data-metrics]'), schemeMetrics, { generalTitle: 'Общие по ПС «Первомайская»' });
    const controller = new AbortController();
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
    let scale = 1;
    let fitScale = 1;
    let initialScale = 1;
    const applyScale = () => {
      size.style.width = `${canvasWidth*scale}px`;
      size.style.height = `${canvasHeight*scale}px`;
      surface.style.transform = `scale(${scale})`;
      controls.querySelector('[data-scheme-control="reset"]').textContent = `${Math.round(scale/initialScale*100)}%`;
      controls.querySelector('[data-scheme-control="out"]').disabled = scale <= fitScale + 0.001;
      controls.querySelector('[data-scheme-control="in"]').disabled = scale >= 3;
    };
    const observer = new ResizeObserver(() => {
      const nextFit = Math.min((frame.clientWidth-2)/canvasWidth,(frame.clientHeight-2)/canvasHeight);
      if (!Number.isFinite(nextFit) || nextFit <= 0) return;
      const nextInitial = nextFit;
      scale = Math.min(3,Math.max(nextFit,scale*nextInitial/initialScale));
      fitScale = nextFit;
      initialScale = nextInitial;
      applyScale();
    });
    observer.observe(frame);
    const zoomAt = (nextScale,clientX,clientY) => {
      nextScale = Math.min(3,Math.max(fitScale,nextScale));
      if (Math.abs(nextScale-scale) < 0.001) return;
      const rect = frame.getBoundingClientRect();
      const x = clientX-rect.left;
      const y = clientY-rect.top;
      const logicalX = (frame.scrollLeft+x)/scale;
      const logicalY = (frame.scrollTop+y)/scale;
      scale = nextScale;
      applyScale();
      frame.scrollLeft = logicalX*scale-x;
      frame.scrollTop = logicalY*scale-y;
    };
    frame.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(scale*(event.deltaY < 0 ? 1.16 : 1/1.16),event.clientX,event.clientY);
    }, { passive:false, signal:controller.signal });
    frame.addEventListener('dblclick', event => {
      event.preventDefault();
      zoomAt(scale*1.5,event.clientX,event.clientY);
    }, { signal:controller.signal });
    let drag = null;
    frame.addEventListener('pointerdown', event => {
      if (event.target.closest('a') || event.pointerType === 'mouse' && event.button !== 0) return;
      drag = { id:event.pointerId, x:event.clientX, y:event.clientY, left:frame.scrollLeft, top:frame.scrollTop };
      frame.setPointerCapture(event.pointerId);
      frame.classList.add('scheme-board__frame--dragging');
    }, { signal:controller.signal });
    frame.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      frame.scrollLeft = drag.left+drag.x-event.clientX;
      frame.scrollTop = drag.top+drag.y-event.clientY;
    }, { signal:controller.signal });
    const stopDrag = event => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      frame.classList.remove('scheme-board__frame--dragging');
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    };
    frame.addEventListener('pointerup',stopDrag,{ signal:controller.signal });
    frame.addEventListener('pointercancel',stopDrag,{ signal:controller.signal });
    controls.addEventListener('click',event => {
      const action = event.target.closest('[data-scheme-control]')?.dataset.schemeControl;
      if (!action) return;
      if (action === 'expand') {
        board.classList.toggle('scheme-board--expanded');
        controls.querySelector('[data-scheme-control="expand"]').setAttribute('aria-pressed',String(board.classList.contains('scheme-board--expanded')));
        return;
      }
      if (action === 'reset') { scale = initialScale; applyScale(); frame.scrollLeft = 0; frame.scrollTop = 0; return; }
      const rect = frame.getBoundingClientRect();
      zoomAt(scale*(action === 'in' ? 1.25 : 1/1.25),rect.left+rect.width/2,rect.top+rect.height/2);
    }, { signal:controller.signal });
    const modes = document.createElement('div'); modes.className = 'header__map-modes'; modes.setAttribute('role','group'); modes.setAttribute('aria-label','Вид карты'); modes.innerHTML = '<a class="header__map-mode" href="./pickets.html" aria-label="Карта">Карта</a><span class="header__map-mode" aria-current="page">Схема</span>'; document.querySelector('#header-root .header__actions').prepend(modes);
    const areas = document.querySelector('#header-root .header__areas'); const item = document.createElement('li'); item.className = 'header__area'; item.innerHTML = '<span class="header__area-link header__area-link--active" aria-current="page">ПС «Первомайская»</span>'; areas.append(item);
    return () => { controller.abort(); observer.disconnect(); metrics.destroy(); modes.remove(); item.remove(); };
  },
};

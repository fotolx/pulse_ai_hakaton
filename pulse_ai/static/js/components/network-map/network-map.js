import { prepareMainScheme } from './main-scheme.js';
import { createMapExtension } from './map-background.js';
import { mountLegend } from '../legend/legend.js';
import { mountMapTooltip } from './map-tooltip.js';
const mapUrl = new URL('../../../img/map/MainCity.svg', import.meta.url);
const systemUrl = new URL('../../../img/map/MainTonnel.svg', import.meta.url);

// MainCity and MainTonnel have different export bounds. The background offset
// matches the design in scheme coordinates, so it stays aligned at every zoom.
export function mountNetworkMap(root, {
  backgroundUrl = mapUrl, schemeUrl = systemUrl, schemeTransform = '',
  label = 'Карта инженерных коллекторов административного округа', viewWidth = 1920, viewHeight = 980, viewY = 0, backgroundWidth = 1995, backgroundHeight = 1068, backgroundX = -6, backgroundY = 21, fit = 'cover',
  prepareScheme = prepareMainScheme, extendBackground = false,
} = {}) {
  const controller = new AbortController();
  root.innerHTML = `<section class="network-map" aria-label="${label}">
    <div class="network-map__viewport" tabindex="0" role="region" aria-label="Интерактивная карта коллекторов. Масштабируйте колесиком мыши или захватывайте для перемещения.">
      <svg class="network-map__canvas" viewBox="0 ${viewY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet" aria-label="Схема коллекторов. Красные точки — инциденты.">
        <image class="network-map__background" href="${backgroundUrl}" x="${backgroundX}" y="${backgroundY}" width="${backgroundWidth}" height="${backgroundHeight}" preserveAspectRatio="none" aria-hidden="true" />
        <g class="network-map__system" transform="${schemeTransform}" fill="none"></g>
      </svg>
    </div>
    <p class="network-map__status" role="status">Загрузка схемы…</p>
    <div class="network-map__legend"></div>
    <div class="network-map__controls" role="group" aria-label="Масштаб карты">
      <button type="button" data-map-control="in" aria-label="Увеличить масштаб" title="Увеличить масштаб">+</button>
      <button type="button" class="network-map__zoom-value" data-map-control="reset" aria-label="Вернуть исходный масштаб 100%" title="Вернуть исходный вид">100%</button>
      <button type="button" data-map-control="out" aria-label="Уменьшить масштаб" title="Уменьшить масштаб" disabled>−</button>
      <button type="button" data-map-control="expand" aria-label="Развернуть карту" title="Развернуть карту" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></svg></button>
    </div>
  </section>`;

  const legend = mountLegend(root.querySelector('.network-map__legend'));
  const viewport = root.querySelector('.network-map__viewport');
  const canvas = root.querySelector('.network-map__canvas');
  const surface = root.querySelector('.network-map');
  const controls = root.querySelector('.network-map__controls');
  const zoomValue = controls.querySelector('[data-map-control="reset"]');
  const zoomIn = controls.querySelector('[data-map-control="in"]');
  const zoomOut = controls.querySelector('[data-map-control="out"]');
  const expand = controls.querySelector('[data-map-control="expand"]');
  const tooltip = mountMapTooltip(root.querySelector('.network-map'), { signal: controller.signal, canOpen: () => !isDragging && !hasMoved });
  if (extendBackground) canvas.prepend(
    typeof extendBackground === 'function' ? extendBackground() : createMapExtension(),
  );

  // Состояние навигации по карте в стиле Google Maps
  let isInitialized = false;
  let baseWidth = viewWidth;
  let baseHeight = viewHeight;
  const minZoom = 1;
  const maxZoom = 8.0;

  const view = {
    x: 0,
    y: viewY,
    width: viewWidth,
    height: viewHeight,
  };

  function applyViewBox() {
    tooltip.hide();
    canvas.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
    const zoom = baseWidth / view.width;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= minZoom + 0.0001;
    zoomIn.disabled = zoom >= maxZoom - 0.0001;
  }

  function setExpanded(active) {
    surface.classList.toggle('network-map--expanded', active);
    expand.setAttribute('aria-pressed', String(active));
    expand.setAttribute('aria-label', active ? 'Свернуть карту' : 'Развернуть карту');
    expand.title = active ? 'Свернуть карту' : 'Развернуть карту';
  }
  controls.addEventListener('click', event => {
    const action = event.target.closest('[data-map-control]')?.dataset.mapControl;
    if (action === 'expand') {
      setExpanded(!surface.classList.contains('network-map--expanded'));
    } else if (action === 'reset') {
      view.width = baseWidth;
      view.height = baseHeight;
      view.x = (viewWidth - baseWidth) / 2;
      view.y = viewY + (viewHeight - baseHeight) / 2;
      applyViewBox();
    } else if (action === 'in' || action === 'out') {
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, action === 'in' ? 1.25 : 1 / 1.25);
    }
  }, { signal: controller.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setExpanded(false);
  }, { signal: controller.signal });

  function zoomAt(clientX, clientY, factor) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;

    const svgX = view.x + fx * view.width;
    const svgY = view.y + fy * view.height;

    const currentZoom = baseWidth / view.width;
    const targetZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom * factor));
    if (Math.abs(targetZoom - currentZoom) < 0.0001) return;

    const newWidth = baseWidth / targetZoom;
    const newHeight = baseHeight / targetZoom;

    view.x = svgX - fx * newWidth;
    view.y = svgY - fy * newHeight;
    view.width = newWidth;
    view.height = newHeight;

    applyViewBox();
  }

  // Расширяем видимую область вместо пустых полей с сохранением текущего зума
  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    const scale = (fit === 'cover' ? Math.max : Math.min)(width / viewWidth, height / viewHeight);
    const newBaseWidth = width / scale;
    const newBaseHeight = height / scale;
    const newBaseX = (viewWidth - newBaseWidth) / 2;
    const newBaseY = viewY + (viewHeight - newBaseHeight) / 2;

    if (!isInitialized) {
      view.x = newBaseX;
      view.y = newBaseY;
      view.width = newBaseWidth;
      view.height = newBaseHeight;
      isInitialized = true;
    } else {
      const currentZoom = baseWidth / view.width;
      const centerX = view.x + view.width / 2;
      const centerY = view.y + view.height / 2;
      view.width = newBaseWidth / currentZoom;
      view.height = newBaseHeight / currentZoom;
      view.x = centerX - view.width / 2;
      view.y = centerY - view.height / 2;
    }
    baseWidth = newBaseWidth;
    baseHeight = newBaseHeight;
    applyViewBox();
  });
  resizeObserver.observe(viewport);

  // Управление жестами: перетаскивание (Pan) и скролл (Zoom)
  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  const activePointers = new Map();
  let pinchDist = 0;

  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16;
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false, signal: controller.signal });

  viewport.addEventListener('dblclick', event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, 1.5);
  }, { signal: controller.signal });

  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    tooltip.hide();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 1) {
      isDragging = true;
      hasMoved = false;
      startX = event.clientX;
      startY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (activePointers.size === 2) {
      const [p1, p2] = Array.from(activePointers.values());
      pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    }
  }, { signal: controller.signal });

  viewport.addEventListener('pointermove', event => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
      const [p1, p2] = Array.from(activePointers.values());
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (pinchDist > 0 && dist > 0) {
        const factor = dist / pinchDist;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        zoomAt(midX, midY, factor);
        pinchDist = dist;
        hasMoved = true;
      }
      return;
    }

    if (!isDragging) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (!hasMoved && Math.hypot(event.clientX - startX, event.clientY - startY) > 4) {
      hasMoved = true;
      // Захватываем указатель только после начала перетаскивания:
      // иначе браузер перенаправляет click с узла на viewport.
      try { viewport.setPointerCapture(event.pointerId); } catch {}
      viewport.classList.add('network-map__viewport--grabbing');
    }

    if (hasMoved) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        view.x -= dx * (view.width / rect.width);
        view.y -= dy * (view.height / rect.height);
        applyViewBox();
      }
    }
  }, { signal: controller.signal });

  const endDrag = event => {
    if (activePointers.has(event.pointerId)) {
      try { viewport.releasePointerCapture(event.pointerId); } catch {}
      activePointers.delete(event.pointerId);
    }
    if (activePointers.size === 0) {
      isDragging = false;
      viewport.classList.remove('network-map__viewport--grabbing');
      if (hasMoved) {
        setTimeout(() => { hasMoved = false; }, 50);
      }
    } else if (activePointers.size === 1) {
      const p = Array.from(activePointers.values())[0];
      lastX = p.x;
      lastY = p.y;
    }
  };

  window.addEventListener('pointerup', endDrag, { signal: controller.signal });
  window.addEventListener('pointercancel', endDrag, { signal: controller.signal });

  viewport.addEventListener('keydown', event => {
    const panStep = 60 * (view.width / (canvas.clientWidth || viewWidth));
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      view.y -= panStep;
      applyViewBox();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      view.y += panStep;
      applyViewBox();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      view.x -= panStep;
      applyViewBox();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      view.x += panStep;
      applyViewBox();
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
    }
  }, { signal: controller.signal });

  const ready = fetch(schemeUrl, { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить схему');
      return response.text();
    })
    .then(source => {
      if (controller.signal.aborted) return;
      const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (documentSvg.querySelector('parsererror')) throw new Error('Некорректный SVG');
      const layer = root.querySelector('.network-map__system');
      layer.append(...[...documentSvg.documentElement.children].map(child => document.importNode(child, true)));

      prepareScheme(layer, { signal: controller.signal, canActivate: () => !hasMoved, tooltip });
      root.querySelector('.network-map__status').hidden = true;
    })
    .catch(error => {
      if (error.name !== 'AbortError') root.querySelector('.network-map__status').textContent = 'Не удалось загрузить схему. Обновите страницу.';
    });
  return { ready, destroy() { controller.abort(); resizeObserver.disconnect(); legend.destroy(); } };
}

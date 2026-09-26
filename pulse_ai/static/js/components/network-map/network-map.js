import { prepareMainScheme } from './main-scheme.js';
import { createMapExtension } from './map-background.js';
import { mountLegend } from '../legend/legend.js';
import { mountMapTooltip } from './map-tooltip.js';
const systemUrl = new URL('../../../img/map/map.svg', import.meta.url);

// The main map includes its background. Other screens can still supply
// separate background and scheme assets with their own export bounds.
export function mountNetworkMap(root, {
  backgroundUrl = null, schemeUrl = systemUrl, schemeTransform = '',
  label = 'Карта инженерных коллекторов административного округа', viewWidth = 1920, viewHeight = 994, viewY = 0, backgroundWidth = 1995, backgroundHeight = 1068, backgroundX = -6, backgroundY = 21, fit = 'cover',
  prepareScheme = prepareMainScheme, extendBackground = false,
} = {}) {
  const controller = new AbortController();
  root.innerHTML = `<section class="network-map" aria-label="${label}">
    <div class="network-map__viewport" role="region" aria-label="Карта коллекторов">
      <svg class="network-map__canvas" viewBox="0 ${viewY} ${viewWidth} ${viewHeight}" preserveAspectRatio="xMidYMid meet" aria-label="Схема коллекторов. Красные точки — инциденты.">
        ${backgroundUrl ? `<image class="network-map__background" href="${backgroundUrl}" x="${backgroundX}" y="${backgroundY}" width="${backgroundWidth}" height="${backgroundHeight}" preserveAspectRatio="none" aria-hidden="true" />` : ''}
        <g class="network-map__system" transform="${schemeTransform}" fill="none"></g>
      </svg>
    </div>
    <p class="network-map__status" role="status">Загрузка схемы…</p>
    <div class="network-map__legend"></div>
  </section>`;

  const legend = mountLegend(root.querySelector('.network-map__legend'));
  const viewport = root.querySelector('.network-map__viewport');
  const canvas = root.querySelector('.network-map__canvas');
  const tooltip = mountMapTooltip(root.querySelector('.network-map'), { signal: controller.signal, canOpen: () => true });
  viewport.addEventListener('pointerdown', event => {
    if (event.target.closest('.network-map__point')) return;
    const focused = document.activeElement;
    if (focused instanceof Element && viewport.contains(focused)) focused.blur();
    tooltip.hide();
  }, { signal: controller.signal });
  if (extendBackground) canvas.prepend(
    typeof extendBackground === 'function' ? extendBackground() : createMapExtension(),
  );

  // Only fit to the viewport; user gestures never change the map view.
  const resizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    const scale = (fit === 'cover' ? Math.max : Math.min)(width / viewWidth, height / viewHeight);
    const fittedWidth = width / scale;
    const fittedHeight = height / scale;
    tooltip.hide();
    canvas.setAttribute('viewBox', `${(viewWidth - fittedWidth) / 2} ${viewY + (viewHeight - fittedHeight) / 2} ${fittedWidth} ${fittedHeight}`);
  });
  resizeObserver.observe(viewport);

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

      prepareScheme(layer, { signal: controller.signal, canActivate: () => true, tooltip });
      root.querySelector('.network-map__status').hidden = true;
    })
    .catch(error => {
      if (error.name !== 'AbortError') root.querySelector('.network-map__status').textContent = 'Не удалось загрузить схему. Обновите страницу.';
    });
  return { ready, destroy() { controller.abort(); resizeObserver.disconnect(); legend.destroy(); } };
}

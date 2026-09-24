const ns = 'http://www.w3.org/2000/svg';

// Продолжение кварталов за границами исходного макета.
// Центральный фрагмент остаётся исходным map-okrug.svg.
export function createMapExtension() {
  const group = document.createElementNS(ns, 'g');
  group.setAttribute('aria-hidden', 'true');
  group.setAttribute('class', 'network-map__extension');
  function shape(tag, attributes) {
    const element = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    group.append(element);
  }
  shape('rect', { x: -6000, y: -6000, width: 14000, height: 14000, fill: '#F6F7F9' });
  // Детерминированные контуры зданий без случайного изменения при перезагрузке.
  for (let row = -12; row < 24; row += 1) {
    for (let column = -35; column < 65; column += 1) {
      const seed = Math.abs(row * 31 + column * 17);
      if (seed % 7 === 0) continue;
      const x = column * 76 + (row % 2) * 22 + seed % 19;
      const y = row * 74 + seed % 23;
      if (x >= 0 && x <= 1920 && y >= 0 && y <= 1080) continue;
      shape('rect', { x, y, width: 24 + seed % 34, height: 18 + seed % 29, fill: '#D9CFBD', opacity: 0.27 });
    }
  }
  // Продолжаем существующие улицы с тем же наклоном, без шва на краях.
  for (const [start, end] of [[140, 171], [323, 344], [568, 558], [792, 782], [975, 995]]) {
    const slope = (end - start) / 1955;
    const y = x => start + (x + 18) * slope;
    shape('path', { d: `M-6000 ${y(-6000)}L8000 ${y(8000)}`, stroke: '#E0E0E6', opacity: 0.6, 'stroke-width': 2, fill: 'none' });
  }
  for (let column = -12; column < 18; column += 1) {
    const x = column * 355 + 340;
    shape('path', { d: `M${x + 22} -6000L${x - 50} 8000`, stroke: '#e9e9ee', 'stroke-width': 2, fill: 'none' });
  }
  return group;
}

export function createDistrictMapExtension() {
  const group = createMapExtension();
  const river = document.createElementNS(ns, 'path');
  // Повторяем исходное русло map-uzel.svg под изображением и продолжаем
  // его по касательным: цвет, ширина и изгиб совпадают на обоих краях.
  const leftSlope = (737.62 - 787.742) / 368.062;
  const rightSlope = (777.718 - 827.84) / (1963 - 1533.59);
  river.setAttribute('d', [
    'M-6000 820',
    `C-4000 600 -1000 ${787.742 - 1000 * leftSlope} 0 787.742`,
    'C368.062 737.62 613.437 867.938 920.156 807.791',
    'C1226.87 747.644 1533.59 827.84 1963 777.718',
    `C2963 ${777.718 + 1000 * rightSlope} 6000 900 8000 760`,
  ].join(' '));
  river.setAttribute('fill', 'none');
  river.setAttribute('stroke', '#B8D4EB');
  river.setAttribute('stroke-width', '70');
  group.append(river);
  return group;
}

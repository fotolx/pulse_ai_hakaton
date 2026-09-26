const ns = 'http://www.w3.org/2000/svg';

// Counts belong to the designer's markers, not to their visual radius.
const incidents = new Map([
  ['941.065,391.065', 2], ['188.065,671.065', 1],
  ['887,392', 4], ['1665,436', 3],
]);

export function prepareMainScheme(layer, { signal, canActivate, tooltip }) {
  // Explicit pairs from map.svg: label position -> icon outline and shape count.
  const annotations = [
    [646, 334, 'M793 369.4', 2, 'ПС «Первомайская»'],
    [923, 294, 'M1000 332.4', 2, 'ПС «Щёлковская»'],
    [733, 478, 'M827 448.4', 2, 'ПС «041086»'],
    [20, 717, 'M57 752.4', 2, 'ПС «452845»'],
    [1304, 189, 'M1268 183.4', 2, 'ПС «958481»'],
    [1638, 238, 'M1785 279.4', 3, 'Соединение «958481» / «451461»'],
    [488, 731, 'M595 703.4', 3, 'Соединение «041086» / «452845»'],
    [1015, 462, 'M1031 438.4', 3, 'Соединение Первомайский / Щёлковский'],
  ];
  const overlays = [];
  for (const [x, y, outline, shapeCount, name] of annotations) {
    const background = layer.querySelector(`rect[x="${x}"][y="${y}"][fill="#E0EDFF"]`);
    const icon = layer.querySelector(`path[d^="${outline}"]`);
    if (!background || !icon) continue;
    const content = document.createElementNS(ns, 'g');
    content.setAttribute('class', 'network-map__annotation-content');
    content.setAttribute('aria-hidden', 'true');
    const parts = [background];
    for (let next = background.nextElementSibling; parts.length < 4 && next; next = next.nextElementSibling) parts.push(next);
    content.append(...parts);

    const trigger = document.createElementNS(ns, 'g');
    trigger.setAttribute('class', 'network-map__annotation-trigger');
    trigger.setAttribute('role', 'img');
    trigger.setAttribute('aria-label', name);
    const shapes = [icon];
    for (let next = icon.nextElementSibling; shapes.length < shapeCount && next; next = next.nextElementSibling) shapes.push(next);
    trigger.append(...shapes);
    trigger.addEventListener('pointerenter', () => content.classList.add('network-map__annotation-content--visible'), { signal });
    trigger.addEventListener('pointerleave', () => content.classList.remove('network-map__annotation-content--visible'), { signal });
    overlays.push(trigger, content);
  }
  // The exported legend is artwork; the fixed HTML legend provides interaction.
  layer.querySelector('g[filter="url(#filter0_d_2002_1284)"]')?.remove();
  const nodes = [...layer.querySelectorAll('circle[stroke="#334C7F"], path[stroke="#334C7F"]')];
  nodes.forEach((node, index) => {
    const box = node.getBBox();
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'network-map__point network-map__point--node');
    node.replaceWith(group);
    group.append(node);
    const hit = document.createElementNS(ns, 'circle');
    hit.setAttribute('cx', box.x + box.width / 2);
    hit.setAttribute('cy', box.y + box.height / 2);
    hit.setAttribute('r', '14');
    hit.setAttribute('fill', 'transparent');
    group.append(hit);
    tooltip.attach(group, String(101 + index));
  });

  layer.querySelectorAll('circle[fill="#D94038"]').forEach((circle, index) => {
    const x = Number(circle.getAttribute('cx'));
    const y = Number(circle.getAttribute('cy'));
    const count = incidents.get(`${x},${y}`);
    const id = `okrug-incident-${index + 1}`;
    const caption = circle.nextElementSibling;
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'network-map__point network-map__point--alert');
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `Открыть инциденты: ${count}, группа ${index + 1}`);
    group.dataset.pointId = id;
    circle.replaceWith(group);
    group.append(circle);
    // Preserve the outlined number and scale it together with the marker.
    if (caption?.matches('path[fill="white"]')) group.append(caption);
    const activate = () => {
      if (!canActivate()) return;
      layer.dispatchEvent(new CustomEvent('network:incident-select', {
        bubbles: true, detail: { id, count, x, y },
      }));
    };
    group.addEventListener('click', activate, { signal });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    }, { signal });
    layer.append(group);
  });
  layer.append(...overlays);
}

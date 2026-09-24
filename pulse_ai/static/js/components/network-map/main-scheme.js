const ns = 'http://www.w3.org/2000/svg';

// Counts belong to the designer's markers, not to their visual radius.
const incidents = new Map([
  ['941.065,412.065', 2], ['188.065,692.065', 1],
  ['887,413', 4], ['1665,457', 3],
]);

export function prepareMainScheme(layer, { signal, canActivate, tooltip }) {
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
}

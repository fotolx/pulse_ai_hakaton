import { mountNetworkMap } from './network-map.js';

const ns = 'http://www.w3.org/2000/svg';
const nodes = [
  ['101', 229.25, 179.25], ['102', 414, 79], ['103', 409, 231],
  ['104', 510, 125], ['105', 557, 189], ['106', 625.25, 409.25],
  ['107', 831, 409], ['108', 812, 322], ['109', 1054.25, 379.25],
  ['110', 1216.25, 464.25], ['201', 1354, 221], ['202', 1211.25, 217.25],
  ['301', 367.25, 655.25], ['302', 536.25, 646.25], ['303', 625.25, 738.25],
  ['304', 859.25, 744.25], ['305', 1301.25, 770.25],
];
const popupNodeIds = new Set(['101', '102', '103', '105', '106', '107', '108', '109', '110', '201', '202', '301', '302', '303', '304', '305']);

function prepareDistrictScheme(layer, { signal, canActivate }) {
  const artworkIn = (x, y, width, height) => [...layer.children].filter(element => {
    if (typeof element.getBBox !== 'function' || element.tagName === 'defs') return false;
    const box = element.getBBox();
    return box.width > 0 && box.height > 0 && box.x >= x - 0.5 && box.y >= y - 0.5 &&
      box.x + box.width <= x + width + 0.5 && box.y + box.height <= y + height + 0.5;
  });
  // Keep the original designer's lettering and icon, but display them as a tooltip.
  const permit = document.createElementNS(ns, 'g');
  permit.id = 'district-permit-tooltip';
  permit.classList.add('network-map__permit-tooltip');
  permit.setAttribute('role', 'tooltip');
  permit.setAttribute('aria-label', 'Допуск АРМ-Контроль активен');
  permit.append(...artworkIn(584, 133, 247, 28));
  const hidePermit = () => { permit.style.display = 'none'; };
  hidePermit();
  // SVG uses paint order: the complete exit sign must be above the tunnel stroke.
  const exitSign = document.createElementNS(ns, 'g');
  exitSign.classList.add('network-map__exit-sign');
  exitSign.append(...artworkIn(1094, 0, 193, 54));
  // Keep each node's original rings, number and status dots together when scaling.
  // Large paths (tunnels, captions and facilities) remain in the static layer.
  const artwork = [...layer.children].filter(element => typeof element.getBBox === 'function');
  for (const [id, x, y] of nodes) {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'network-map__point network-map__district-point');
    group.style.transformBox = 'view-box';
    group.style.transformOrigin = `${x}px ${y}px`;
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `Узел ${id}`);
    group.dataset.nodeId = id;
    if (popupNodeIds.has(id)) {
      group.setAttribute('aria-haspopup', 'dialog');
      group.setAttribute('aria-controls', `district-node-popup-${id}`);
      group.setAttribute('aria-expanded', 'false');
    }
    for (const element of artwork) {
      if (element.parentNode !== layer) continue;
      const box = element.getBBox();
      if (box.width > 0 && box.height > 0 && box.x >= x - 38 && box.y >= y - 38 &&
        box.x + box.width <= x + 38 && box.y + box.height <= y + 38) group.append(element);
    }
    const hitArea = document.createElementNS(ns, 'circle');
    hitArea.setAttribute('cx', x);
    hitArea.setAttribute('cy', y);
    hitArea.setAttribute('r', '35');
    hitArea.setAttribute('fill', 'transparent');
    group.prepend(hitArea);
    for (const dot of group.querySelectorAll('circle[fill="#A6A6AD"], circle[fill="#ADADAD"]')) {
      const indicator = document.createElementNS(ns, 'g');
      indicator.classList.add('network-map__permit-indicator');
      indicator.setAttribute('tabindex', '0');
      indicator.setAttribute('role', 'img');
      indicator.setAttribute('aria-label', `Активный допуск на пикете ${id}`);
      indicator.setAttribute('aria-describedby', permit.id);
      dot.replaceWith(indicator);
      indicator.append(dot);
      const target = dot.cloneNode();
      target.setAttribute('r', '10');
      target.setAttribute('fill', 'transparent');
      target.removeAttribute('stroke');
      indicator.append(target);
      const showPermit = () => {
        if (!canActivate()) return;
        const cx = Number(dot.getAttribute('cx'));
        const cy = Number(dot.getAttribute('cy'));
        permit.setAttribute('transform', `translate(${cx + 14 - 584} ${cy - 36 - 133})`);
        permit.style.display = '';
      };
      indicator.addEventListener('pointerenter', showPermit, { signal });
      indicator.addEventListener('pointerleave', hidePermit, { signal });
      indicator.addEventListener('focus', showPermit, { signal });
      indicator.addEventListener('blur', hidePermit, { signal });
    }
    layer.append(group);
    const activate = () => {
      if (canActivate()) layer.dispatchEvent(new CustomEvent('network:incident-select', {
        bubbles: true, detail: { id: `district-node-${id}`, nodeId: id, x, y },
      }));
    };
    group.addEventListener('click', activate, { signal });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    }, { signal });
  }
  layer.append(exitSign, permit);
  const viewport = layer.closest('.network-map__viewport');
  viewport.addEventListener('pointerdown', hidePermit, { signal });
  viewport.addEventListener('wheel', hidePermit, { signal, passive: true });
  viewport.addEventListener('keydown', event => {
    if (['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '=', '-', '_'].includes(event.key)) hidePermit();
  }, { signal });
}

export function mountDistrictMap(root) {
  return mountNetworkMap(root, {
    backgroundUrl: new URL('../../../img/map/MainOkrug.svg', import.meta.url),
    schemeUrl: new URL('../../../img/map/TonnelOkrug.svg', import.meta.url),
    // Fit the complete 1514 × 976 artwork on the 1884 × 871 background without distortion.
    schemeTransform: 'translate(321.26 30) scale(0.82)',
    label: 'Карта инженерных коллекторов района',
    viewWidth: 1884,
    viewHeight: 871,
    backgroundWidth: 1884,
    backgroundHeight: 871,
    backgroundX: 0,
    backgroundY: 0,
    fit: 'cover',
    prepareScheme: prepareDistrictScheme,
  });
}

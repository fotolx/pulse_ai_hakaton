import { mountDistrictMap } from '../components/network-map/district-map.js';
import { mountNodePopup } from '../components/network-map/node-popup.js';
import { districtNode103 } from '../data/district-node.js';

export default {
  title: 'Район',
  render: () => `<h1 class="visually-hidden">Обзор сети: район</h1>
    <div class="district-map-page" data-district-map></div>`,
  mount(root) {
    const map = mountDistrictMap(root.querySelector('[data-district-map]'));
    const popup = mountNodePopup(root);
    const alarmPopup = mountNodePopup(root, { node: districtNode103 });
    const openEquipment = event => {
      if (event.detail?.nodeId === '104') location.href = new URL('/equipment/', location.href).href;
    };
    root.addEventListener('network:incident-select', openEquipment);
    const surface = root.querySelector('.network-map');
    const warning = document.createElement('p');
    warning.className = 'district-map-warning';
    warning.textContent = '⚠ Координаты условные — демонстрационная схема, без привязки к реальной геодезии';
    surface.append(warning);

    const modes = document.createElement('div');
    modes.className = 'header__map-modes';
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'Вид карты');
    modes.innerHTML = `
      <button type="button" class="header__map-mode" data-map-mode="map" aria-pressed="true"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m1 3 4-2 6 2 4-2v12l-4 2-6-2-4 2V3ZM5 1v12M11 3v12"/></svg>Карта</button>
      <button type="button" class="header__map-mode" data-map-mode="scheme" aria-pressed="false"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 12 3-8 5 4M7 4l5-2"/><circle cx="4" cy="12" r="1.5"/><circle cx="7" cy="4" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="12" cy="2" r="1.5"/></svg>Схема</button>`;
    document.querySelector('#header-root .header__actions').prepend(modes);
    const changeMode = event => {
      const button = event.target.closest('[data-map-mode]');
      if (!button) return;
      if (button.dataset.mapMode === 'scheme') {
        location.href = '/scheme/';
        return;
      }
      surface.classList.toggle('network-map--scheme', false);
      modes.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    };
    modes.addEventListener('click', changeMode);
    return () => {
      modes.removeEventListener('click', changeMode);
      modes.remove();
      popup.destroy();
      alarmPopup.destroy();
      root.removeEventListener('network:incident-select', openEquipment);
      map.destroy();
    };
  },
};

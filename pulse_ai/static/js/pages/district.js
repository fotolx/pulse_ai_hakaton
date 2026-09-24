import { mountNetworkMap } from '../components/network-map/network-map.js';
import { mountMetrics } from '../components/metrics/metrics.js';
import { dashboardMetrics } from '../data/dashboard.js';

export default {
  title: 'Административный округ',
  render: () => `<h1 class="visually-hidden">Обзор сети: административный округ</h1>
    <div class="dashboard"><div class="dashboard__map" data-network-map></div><div class="dashboard__metrics" data-metrics></div></div>`,
  mount(root) {
    const map = mountNetworkMap(root.querySelector('[data-network-map]'));
    const warning = document.createElement('p');
    warning.className = 'district-map-warning';
    warning.textContent = '⚠ Координаты условные — демонстрационная схема, без привязки к реальной геодезии';
    root.querySelector('.network-map').append(warning);
    const openPickets = () => { location.href = new URL('./pickets.html', location.href).href; };
    root.addEventListener('network:incident-select', openPickets);
    const metrics = mountMetrics(root.querySelector('[data-metrics]'), dashboardMetrics);
    const update = event => metrics.update(event.detail);
    root.addEventListener('dashboard:metrics-update', update);
    return () => {
      map.destroy();
      metrics.destroy();
      root.removeEventListener('network:incident-select', openPickets);
      root.removeEventListener('dashboard:metrics-update', update);
    };
  },
};

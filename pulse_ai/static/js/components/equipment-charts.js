import { equipmentHours } from '../services/equipment.js';

export function mountEquipmentChart(root, sensor, { licenseKey = '' } = {}) {
  if (!window.anychart) throw new Error('Библиотека AnyChart не загрузилась. Обновите страницу.');
  const chart = window.anychart.cartesian();
  try {
    if (licenseKey) { window.anychart.licenseKey(licenseKey); chart.credits().enabled(false); }
    chart.animation(false);
    chart.background().fill('none');
    chart.margin(0);
    chart.padding(0);
    chart.xAxis(false);
    chart.yAxis(false);
    chart.xGrid(false);
    chart.yGrid(false);
    chart.legend(false);
    chart.xScale().mode('continuous');
    chart.yScale().minimum(sensor.chart.min).maximum(sensor.chart.max);
    chart.tooltip().titleFormat(function () {
      const hour = Number(this.x);
      return hour === 0 ? 'Сейчас' : `${hour < 0 ? 'История' : 'Прогноз'} · ${Math.abs(hour)} ч`;
    });
    chart.tooltip().format(function () { return `${this.value} ${sensor.chart.unit}`; });
    const color = sensor.severity === 'danger' ? '#ff4149' : sensor.severity === 'unknown' ? '#91a1ab' : '#00c894';
    const history = new Map(sensor.chart.history.map(point => [point.hour, point.value]));
    const forecast = new Map([[0, history.get(0)], ...sensor.chart.forecast.map(point => [point.hour, point.value])]);
    for (const [name, points, opacity] of [['История', history, 0.09], ['Прогноз', forecast, 0.15]]) {
      const series = chart.stepArea(equipmentHours.map(hour => ({ x: String(hour), value: points.has(hour) ? points.get(hour) : null })));
      series.name(name);
      series.stepDirection('forward');
      series.connectMissingPoints(false);
      series.stroke({ color, thickness: 1.5 });
      series.fill({ color, opacity });
      series.markers(false);
      series.hovered().markers().enabled(false);
    }
    chart.container(root);
    chart.draw();
    return chart;
  } catch (error) { chart.dispose(); throw error; }
}

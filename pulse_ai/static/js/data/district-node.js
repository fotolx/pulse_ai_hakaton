// Демонстрационный снимок показаний из предоставленного макета.
export const districtNode107 = {
  id: '107',
  observedAt: '2026-09-18T16:34:12+03:00',
  observedLabel: '18.09.2026 16:34:12',
  coordinates: '55.789431, 37.638219',
  age: '6 лет', cycles: '41 200',
  lastMaintenance: '02.08.2026', nextMaintenance: '02.02.2027',
  quietDays: 14, affectedSystems: 0, totalSystems: 10,
  photo: new URL('../../img/nodes/node-107.jpg', import.meta.url).href,
  scheme: new URL('../../img/map/TonnelOkrug.svg', import.meta.url).href,
  sensors: [
    { name: 'КД Дверь', value: 'На охране' },
    { name: 'Дым', value: 'Дыма нет' },
    { name: 'Температура', value: '22.4 °C' },
    { name: 'Движение', value: 'Движения нет' },
    { name: 'Газ', value: 'Норма' },
    { name: 'ИБП', value: 'Есть питание' },
  ],
};

export const districtNode103 = {
  ...districtNode107,
  id: '103', affectedSystems: 3, totalSystems: 5, alarm: true,
  photo: new URL('../../img/nodes/node-103.jpg', import.meta.url).href,
  scheme: new URL('../../img/map/TonnelOkrug.svg', import.meta.url).href,
  sensors: [
    { name: 'КД Дверь', value: 'На охране' },
    { name: 'Дым', value: 'Обнаружен дым', alert: true },
    { name: 'Температура', value: '64.2 °C', alert: true },
    { name: 'Движение', value: 'Движения нет' },
    { name: 'Газ', value: 'Норма' },
    { name: 'ИБП', value: 'Много неисправных', alert: true },
  ],
};

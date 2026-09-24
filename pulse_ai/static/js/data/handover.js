import { dashboardMetrics } from './dashboard.js';

// Демонстрационная сводка по макету; источник впоследствии заменяется API.
export const handoverSummary = {
  from: 'Иванов А.', to: 'Петрова С.', scheduledAt: '2026-09-19T20:00:00+03:00',
  alertsTotal: dashboardMetrics.activeAlerts,
  alerts: [
    { title: 'Кластер · Первомайский (4)', description: 'Узлы 102–105, пожар, дым обнаружен, отправлена бригада' },
    { title: 'Шахта 401', description: 'Требует проверки, без комментария' },
    { title: 'Узел 402', description: 'Требует проверки, без комментария' },
    { title: 'Узел 403', description: 'Требует проверки, без комментария' },
  ],
  offline: dashboardMetrics.offline, permits: dashboardMetrics.permits,
  maintenance: dashboardMetrics.maintenance, incompleteMaintenance: 2,
};

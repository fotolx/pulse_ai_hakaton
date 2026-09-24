const key = 'collector:node-decisions:v1';

// Локальный адаптер до подключения сервера: сохраняет решение вместе
// со снимком показаний, но не отправляет его в обучение модели.
export function createLocalNodeDecisionService(storage = () => localStorage) {
  function read() {
    const source = storage().getItem(key);
    if (!source) return {};
    const records = JSON.parse(source);
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
      throw new Error('Некорректное хранилище решений');
    }
    return records;
  }
  return {
    load(nodeId) {
      const record = read()[nodeId];
      return ['monitoring', 'maintenance', 'dispatch', 'false-alarm'].includes(record?.decision) ? record : null;
    },
    saveMonitoring(node) {
      return this.saveDecision(node, 'monitoring');
    },
    saveDecision(node, decision) {
      if (!['monitoring', 'maintenance', 'dispatch', 'false-alarm'].includes(decision)) throw new Error('Неизвестное решение');
      const records = read();
      // Повторное открытие карточки не создаёт новый эталон.
      if (records[node.id]?.decision === decision) return records[node.id];
      const record = {
        nodeId: node.id, decision, decidedAt: new Date().toISOString(),
        source: 'demo', observedAt: node.observedAt,
        sensors: node.sensors.map(sensor => ({ ...sensor })),
      };
      storage().setItem(key, JSON.stringify({ ...records, [node.id]: record }));
      return record;
    },
  };
}

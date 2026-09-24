const recordKey = 'collector:last-handover';

// Локальный адаптер. Для сервера замените saveHandover или передайте save в компонент.
export async function saveHandover(record) {
  if (record.note.length > 1000) throw new Error('Заметка не должна превышать 1000 символов.');
  const saved = { ...record, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  localStorage.setItem(recordKey, JSON.stringify(saved));
  return { record: saved, message: 'Сводка смены сохранена.' };
}

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

// Production currently serializes Moscow wall-clock values with a trailing Z.
// Convert that mislabeled value to the real UTC instant before normal formatting.
export function normalizeServerEventTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp - MOSCOW_OFFSET_MS).toISOString();
}

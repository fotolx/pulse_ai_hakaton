export function dispatcherApiUrl(endpoint) {
  const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname);
  const base = location.protocol === 'http:' && local
    ? `http://${location.hostname}:3001`
    : location.origin;
  return new URL(endpoint, base);
}

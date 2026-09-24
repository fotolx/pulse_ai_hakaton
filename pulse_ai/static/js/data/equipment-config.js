// Set endpoint to the ML API URL to replace the local JSON fixture.
export const equipmentConfig = {
  endpoint: null,
  demoUrl: new URL('./equipment-demo.json', import.meta.url).href,
  refreshMs: 15000,
  timeoutMs: 10000,
  anychartLicenseKey: '',
};

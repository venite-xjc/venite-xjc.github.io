// GoatCounter owns collection and deduplication; this only loads its official client.
export function startTracking(config) {
  if (!config.allowedHosts?.includes(location.hostname) || location.protocol !== 'https:') return;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(config.goatcounterSite || '')) return;
  const endpoint = `https://${config.goatcounterSite}.goatcounter.com/count`;
  if ([...document.querySelectorAll('script[data-goatcounter]')].some(s => s.dataset.goatcounter === endpoint)) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = endpoint;
  document.head.append(script);
}

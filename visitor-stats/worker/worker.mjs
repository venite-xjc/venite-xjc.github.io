const TTL = 600;
const MAX_STALE = 86400;
const RETRY_DELAY = 30000;
const PAGE_SIZE = 100;
// Provider diagnostics stay in private server logs and credentials are redacted.
class StatisticsError extends Error {}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new StatisticsError('Invalid count');
  return value;
}

export function normalizeCountries(rows) {
  const countries = new Map();
  let unknown = 0;
  for (const row of rows) {
    const visits = count(row.count);
    const code = String(row.id || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || ['XX', 'ZZ'].includes(code)) {
      unknown += visits;
      continue;
    }
    countries.set(code, (countries.get(code) || 0) + visits);
  }
  return {
    countries: [...countries].filter(([, visits]) => visits > 0)
      .map(([code, visits]) => ({ code, visits }))
      .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code)),
    unknown,
  };
}

export async function loadStats(env, fetcher = fetch, now = Date.now()) {
  const siteCode = env.GOATCOUNTER_SITE;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(siteCode || '') || !env.GOATCOUNTER_TOKEN) {
    throw new StatisticsError('Not configured');
  }
  const base = `https://${siteCode}.goatcounter.com`;
  async function get(path, params) {
    const url = new URL(`/api/v0/${path}`, base);
    if (params) url.search = new URLSearchParams(params).toString();
    const response = await fetcher(url.href, {
      headers: { Authorization: `Bearer ${env.GOATCOUNTER_TOKEN}`, 'Content-Type': 'application/json' },
      // Workers supports manual/follow only; reject redirects via the status check.
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      let reason = '';
      try {
        const body = await response.json();
        if (typeof body.error === 'string') reason = `: ${body.error.replaceAll(env.GOATCOUNTER_TOKEN, '[redacted]').slice(0, 160)}`;
      } catch { /* Non-JSON error pages are never logged. */ }
      throw new StatisticsError(`Provider ${path} returned HTTP ${response.status}${reason}`);
    }
    return response.json();
  }
  const metadata = await get('sites');
  const site = metadata.sites?.find(item => item.code === siteCode);
  if (!site) throw new StatisticsError('Site not found');
  // GoatCounter currently spells this response field with three t's.
  const settings = site.setttings || site.settings;
  if (settings?.data_retention > 0) throw new StatisticsError('All-time mode requires retention disabled');
  const result = {
    version: 1, provider: 'GoatCounter', period: 'all-time', metric: 'visits',
    updatedAt: new Date(now).toISOString(), since: null,
    totalVisits: 0, countryCount: 0, unknownVisits: 0, countries: [],
  };
  if (!site.received_data) return result;
  const firstHit = new Date(site.first_hit_at);
  if (!Number.isFinite(firstHit.getTime()) || firstHit.getTime() > now) throw new StatisticsError('Invalid first visit');
  result.since = firstHit.toISOString();
  // Include the complete first/current dates even across account timezones.
  const start = new Date(firstHit);
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(23, 59, 59, 0);
  const range = { start: start.toISOString(), end: end.toISOString() };
  async function countriesForRange() {
    const rows = [];
    for (let page = 0; page < 5; page += 1) {
      // Leave room for metadata/total requests in GoatCounter's four-per-second limit.
      if (page > 0) await new Promise(resolve => setTimeout(resolve, 600));
      const data = await get('stats/locations', { ...range, limit: String(PAGE_SIZE), offset: String(rows.length) });
      if (!Array.isArray(data.stats)) throw new StatisticsError('Invalid country response');
      rows.push(...data.stats);
      if (!data.more) return rows;
      if (!data.stats.length) throw new StatisticsError('Invalid pagination');
    }
    throw new StatisticsError('Incomplete countries');
  }
  const [totals, rows] = await Promise.all([get('stats/total', range), countriesForRange()]);
  const normalized = normalizeCountries(rows);
  result.totalVisits = count(totals.total_utc);
  result.countries = normalized.countries;
  result.countryCount = normalized.countries.length;
  result.unknownVisits = normalized.unknown;
  return result;
}

export function createWorker({ fetcher = (...args) => fetch(...args), now = Date.now, cache, logError = message => console.warn(message) } = {}) {
  let memory;
  let pending;
  let lastAttempt = -Infinity;
  return {
    async fetch(request, env, ctx = { waitUntil() {} }) {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
      const cors = origin && allowed.includes(origin) ? origin : null;
      function respond(body, status = 200, maxAge = 0) {
        return new Response(JSON.stringify(body), { status, headers: {
          'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
          'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
          Vary: 'Origin', ...(cors ? { 'Access-Control-Allow-Origin': cors } : {}),
        } });
      }
      if (url.pathname !== '/stats' || url.search) return respond({ error: 'Not found' }, 404);
      if (origin && !cors) return respond({ error: 'Origin not allowed' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        ...(cors ? { 'Access-Control-Allow-Origin': cors } : {}),
        'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', Vary: 'Origin',
      } });
      if (request.method !== 'GET') return respond({ error: 'Method not allowed' }, 405);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(env.GOATCOUNTER_SITE || '') || !env.GOATCOUNTER_TOKEN) {
        return respond({ error: 'Statistics unavailable' }, 503);
      }
      const storage = cache || globalThis.caches?.default;
      const key = new Request(`${url.origin}/cache/${env.GOATCOUNTER_SITE}/v1`);
      function report(error) {
        const detail = error instanceof StatisticsError ? error.message :
          error instanceof Error ? `${error.name}: ${error.message}` : 'Statistics refresh failed';
        logError(detail.replaceAll(env.GOATCOUNTER_TOKEN, '[redacted]').slice(0, 240));
      }
      function age(data) { return now() - Date.parse(data.updatedAt); }
      function usable(data) {
        return data?.version === 1 && age(data) >= -60000 && age(data) < MAX_STALE * 1000;
      }
      function refresh() {
        if (!pending) {
          lastAttempt = now();
          pending = loadStats(env, fetcher, now()).then(data => {
            memory = { site: env.GOATCOUNTER_SITE, data };
            if (storage) ctx.waitUntil(storage.put(key, new Response(JSON.stringify(data), {
              // Retain a real snapshot after the ten-minute freshness window.
              headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${MAX_STALE}` },
            })).catch(() => {}));
            return data;
          }).finally(() => { pending = null; });
        }
        return pending;
      }
      let snapshot = memory?.site === env.GOATCOUNTER_SITE && usable(memory.data) ? memory.data : null;
      if (!snapshot && storage) {
        try {
          const cached = await storage.match(key);
          const data = cached && await cached.json();
          if (usable(data)) {
            snapshot = data;
            memory = { site: env.GOATCOUNTER_SITE, data };
          }
        } catch { /* Cache failures must not block the provider fallback. */ }
      }
      if (snapshot) {
        // Never make a visitor wait for upstream APIs when a real snapshot exists.
        if (age(snapshot) >= TTL * 1000 && !pending && now() - lastAttempt >= RETRY_DELAY) {
          ctx.waitUntil(refresh().catch(report));
        }
        return respond(snapshot, 200, 60);
      }
      try {
        return respond(await refresh(), 200, 60);
      } catch (error) {
        report(error);
        return respond({ error: 'Statistics temporarily unavailable' }, 502);
      }
    },
  };
}

export default createWorker();

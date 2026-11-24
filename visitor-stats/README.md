# Visitor statistics

This is an isolated Web Component for the existing GitHub Pages site.
The only integration in `index.html` is:

```html
<visitor-stats></visitor-stats>
<script type="module" src="visitor-stats/component.js"></script>
```

The component markup and CSS run inside a Shadow DOM. They do
not add rules to `stylesheet.css`, change the bio language controls, or replace
page-wide JavaScript. `tracker.js` loads the official GoatCounter client only
when enabled on an explicitly allowed production hostname. No React or website-wide
build is required. Delete the two integration lines to remove the feature.

The browser downloads only the generated `component.js`: the component logic,
tracker loader, CSS, public configuration and map are bundled together. This
removes the previous sequence of separate script/config/CSS/map requests. The
styled map renders immediately when that one script arrives, and statistics load
independently. Source files remain separate and readable in this directory.

After editing component source, CSS, map or configuration, rebuild from this directory:

```sh
npm ci
npm run build
```

Commit the source changes and regenerated `component.js`. GitHub Pages serves that
file directly and does not need to run Node or install dependencies.

The account is configured as `venite` (`https://venite.goatcounter.com`). The
adapter is deployed at `https://venite-visitor-stats.venite-xjc.workers.dev/stats`,
and that public endpoint is configured in `config.json`. The read-only
`GOATCOUNTER_TOKEN` Secret is configured in Cloudflare. The live API connection
was verified on 2026-11-24; the new account returned genuine zero-visit statistics.

Collection is enabled for the production hostname once this code is published.
If `statsEndpoint` is empty, the visual component stays hidden while collection
continues. Set `enabled` to `false` to disable both. No sample numbers are shipped
and local preview visits are not collected.

## 1. Create the hosted analytics account

Sign up manually at https://www.goatcounter.com/signup and verify your email.
Use `venite-xjc.github.io` as the site domain. The account code determines
`https://YOUR_CODE.goatcounter.com`; the code need not match the site hostname.

In site settings:

- Keep Country and Sessions collection enabled.
- Set Data retention to `0` (no automatic age-based deletion) for All time.
- This integration is intended for visits to this homepage. Do not send custom
  events to the same GoatCounter site: the total API also includes events.
- Set the API user's timezone to UTC for consistent country/date aggregation.

Create an API token with only **Read statistics** and **Read sites** permissions.
The Worker needs site metadata to find the first recorded visit; it never uses
account settings write permissions. Keep the token out of chat and Git.

GoatCounter deduplicates repeat visits to the same path for up to eight hours by
default. The displayed metric is **visits**, not lifetime unique people or raw
page loads. It uses the provider's counts without inventing another deduplication
scheme. Only traffic recorded after tracking is installed is available.

## 2. Deploy the read-only adapter

Create a free Cloudflare account. The Worker uses no D1, KV, paid database, or
scheduled job. It only reads the GoatCounter API and caches aggregate results.

In `worker/wrangler.toml`, `GOATCOUNTER_SITE` is already set to `venite`. Keep
`ALLOWED_ORIGINS` set to your site's HTTPS origin. Add any real custom domain to
that comma-separated list if the site later uses one.

With Cloudflare's Wrangler CLI, run from `visitor-stats/worker`:

```sh
npx wrangler login
npx wrangler secret put GOATCOUNTER_TOKEN
npx wrangler deploy
```

Paste the read-only GoatCounter token at the secret command's hidden prompt.
Do not put it in TOML, frontend config, or a command argument. The same code can
also be pasted into a Worker in the Cloudflare dashboard: configure the two plain
variables and add `GOATCOUNTER_TOKEN` as a Secret there.

The deployed endpoint is `https://<worker-address>/stats`. Only this fixed route
is exposed; it accepts no user-selected upstream URL, account, date, or path.
CORS permits configured website origins. The returned totals/country aggregates
are public by design; CORS is not authentication.

The adapter reads the first-hit date, all country pages (100 per page), and the
UTC total. Unknown locations are shown separately and are not counted as a
country. A positive automatic-retention window makes the adapter fail rather
than label a partial historical dataset as All time.

Results are fresh for ten minutes in the Worker isolate and, where supported,
the edge cache. Existing real snapshots are retained for up to a day and returned
immediately while stale data refreshes in the background. Concurrent refreshes are
combined, and retries back off after failures. A cold cache still reads GoatCounter;
total and country queries run in parallel after site metadata is known.

The component also saves the latest validated aggregate response in browser storage
for up to a day. Repeat visits render it immediately, then request current data.
If that request fails, saved counts remain visible with a notice; storage blocking
falls back to normal fetching. The saved object contains public totals/countries,
not a visitor identifier. The All time tooltip always shows the real snapshot date.
Failures without any valid snapshot display an unavailable state, not fake zeros.
The account, API token, internal errors, and raw individual events are never
returned. GoatCounter's rate limits still apply across regions; heavy traffic
can require further shared caching. Do not enable a paid plan for this setup.

## 3. Enable the component

Edit `config.json`, then run `npm run build`:

```json
{
  "enabled": true,
  "goatcounterSite": "venite",
  "statsEndpoint": "https://venite-visitor-stats.venite-xjc.workers.dev/stats",
  "allowedHosts": ["venite-xjc.github.io"]
}
```

Add any custom production domain to `allowedHosts` as well. Leave API keys out.
Open the real site after deployment, then check GoatCounter and `/stats`.
The provider batches writes and the component caches reads, so the first visit
may take several minutes to appear. Visits blocked by browser tracking protection
will not be counted.

## Checks

The adapter tests use provider-shaped fixtures, not a real account:

```sh
node --test visitor-stats/worker/worker.test.mjs
```

Browser QA covers disabled mode, live-shaped responses, empty/error states,
pagination of the visible ranking, mobile layout, and Shadow DOM isolation.
The deployed API and the component's cross-origin requests are also checked
against the configured account. Collection on the published homepage is the final
deployment check; local previews deliberately do not generate pageviews.

## Files and sources

- `component.source.js`: markup, rendering, aggregate cache and loading/error states.
- `component.js`: generated browser bundle; no public globals; do not edit by hand.
- `build.mjs`, `package.json`: component-only build; no changes to the website build.
- `component.css`: isolated component style (pale blue `#9DBBD8`, 20px radius).
- `tracker.js`: production-only official GoatCounter script loader.
- `config.json`: public account code and deployed aggregate API URL; enabled.
- `world-map.json`: projected world outlines and country-level marker anchors.
- `worker/`: independent read-only Cloudflare Worker and tests.

Map geometry is Natural Earth public-domain data via `@d3-maps/atlas` 1.0.0
(https://github.com/souljorje/d3-maps), projected with `d3-geo` 3.1.1. The 110m
outlines and 50m country centroids are bundled as static JSON; no map-library CDN
or geolocation API is needed by visitors. Markers represent countries/regions,
not individual visitors' precise locations.

API: https://www.goatcounter.com/help/api
Sessions: https://www.goatcounter.com/help/sessions
Retention cleanup implementation: https://github.com/arp242/goatcounter/blob/main/cron/tasks.go
Cloudflare secrets: https://developers.cloudflare.com/workers/configuration/secrets/

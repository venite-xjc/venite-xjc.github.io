import { startTracking } from './tracker.js';

const asset = name => new URL(name, import.meta.url);
const SVG = 'http://www.w3.org/2000/svg';
const number = new Intl.NumberFormat('en');
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

async function readJSON(url) {
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

function svgElement(tag, attributes) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}

function validate(data) {
  if (data.version !== 1 || data.period !== 'all-time' || data.metric !== 'visits' ||
      !Number.isSafeInteger(data.totalVisits) || data.totalVisits < 0 ||
      !Number.isSafeInteger(data.unknownVisits) || data.unknownVisits < 0 ||
      !Array.isArray(data.countries) || data.countries.length > 300) throw new Error('Invalid data');
  const seen = new Set();
  for (const row of data.countries) {
    if (!/^[A-Z]{2}$/.test(row.code) || seen.has(row.code) || !Number.isSafeInteger(row.visits) || row.visits <= 0) throw new Error('Invalid country');
    seen.add(row.code);
  }
  if (data.countryCount !== seen.size || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('Invalid summary');
  return data;
}

class VisitorStats extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.hidden = true;
    this.initialize();
  }
  async initialize() {
    try {
      this.config = await readJSON(asset('config.json'));
      if (!this.config.enabled) return;
      // Collection can start before the read-only dashboard adapter is deployed.
      startTracking(this.config);
      if (!this.config.statsEndpoint) return;
      const endpoint = new URL(this.config.statsEndpoint);
      if (endpoint.protocol !== 'https:') return;
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet">
        <section class="panel" aria-labelledby="visitors-title">
          <div class="header">
            <div class="heading"><h2 id="visitors-title">Visitors</h2><span class="period">All time</span></div>
            <div class="summary"><span><strong data-total>—</strong>visits</span><span><strong data-countries>—</strong>countries / regions</span></div>
          </div>
          <div class="body">
            <div class="map"><svg viewBox="0 0 640 288" role="img" aria-label="Visitor distribution by country"><g data-land></g><g data-markers></g></svg></div>
            <div><ol class="ranking" aria-label="Top visitor countries"></ol><p class="message" role="status">Loading visitor statistics…</p><button type="button" class="retry" hidden>Retry</button></div>
          </div>
          <div class="footer">
            <details hidden><summary></summary><ol class="all-countries" aria-label="More visitor countries"></ol></details>
            <p class="status" hidden></p>
          </div>
        </section>`;
      const stylesheet = this.shadowRoot.querySelector('link');
      const stylesReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Styles unavailable')), 15000);
        stylesheet.onload = () => { clearTimeout(timeout); resolve(); };
        stylesheet.onerror = () => { clearTimeout(timeout); reject(new Error('Styles unavailable')); };
        stylesheet.href = asset('component.css').href;
      });
      this.shadowRoot.querySelector('.retry').addEventListener('click', () => this.refresh());
      // Shadow-root stylesheets do not block paint; avoid revealing unstyled content.
      await stylesReady;
      this.hidden = false;
      this.geometry = await readJSON(asset('world-map.json'));
      const land = this.shadowRoot.querySelector('[data-land]');
      for (const feature of this.geometry.features) {
        land.append(svgElement('path', { d: feature.path, class: 'land', 'data-country': feature.code }));
      }
      this.refresh();
    } catch {
      if (this.shadowRoot.querySelector('.message')) this.fail();
    }
  }
  fail() {
    const message = this.shadowRoot.querySelector('.message');
    message.hidden = false;
    message.textContent = 'Visitor statistics are temporarily unavailable.';
    this.shadowRoot.querySelector('.retry').hidden = false;
  }
  async refresh() {
    if (this.loading) return;
    this.loading = true;
    const root = this.shadowRoot;
    root.querySelector('.retry').hidden = true;
    root.querySelector('.message').textContent = 'Loading visitor statistics…';
    try {
      // Geometry is normally already loaded; retry can also recover a failed map request.
      if (!this.geometry) {
        this.geometry = await readJSON(asset('world-map.json'));
        const land = root.querySelector('[data-land]');
        land.replaceChildren(...this.geometry.features.map(f => svgElement('path', { d: f.path, class: 'land', 'data-country': f.code })));
      }
      const data = validate(await readJSON(this.config.statsEndpoint));
      root.querySelector('[data-total]').textContent = number.format(data.totalVisits);
      root.querySelector('[data-countries]').textContent = number.format(data.countryCount);
      root.querySelector('.period').title = `Updated ${new Date(data.updatedAt).toLocaleString()}${data.since ? ` · Since ${new Date(data.since).toLocaleDateString()}` : ''}`;
      const countries = [...data.countries].sort((a,b) => b.visits - a.visits || a.code.localeCompare(b.code));
      const rows = countries.map(country => {
        const row = document.createElement('li');
        const label = document.createElement('div'); label.className = 'country-label';
        const name = document.createElement('span'); name.textContent = regionNames.of(country.code);
        const value = document.createElement('span'); value.textContent = number.format(country.visits);
        label.append(name, value);
        const track = document.createElement('div'); track.className = 'track'; track.setAttribute('aria-hidden','true');
        const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = `${country.visits / countries[0].visits * 100}%`;
        track.append(fill); row.append(label,track); return row;
      });
      root.querySelector('.ranking').replaceChildren(...rows.slice(0,6));
      root.querySelector('.all-countries').replaceChildren(...rows.slice(6));
      const details = root.querySelector('details');
      details.hidden = countries.length <= 6;
      details.querySelector('summary').textContent = `Show ${Math.max(0,countries.length - 6)} more`;
      const visits = new Map(countries.map(c => [c.code,c.visits]));
      root.querySelectorAll('.land').forEach(el => el.classList.toggle('visited',visits.has(el.dataset.country)));
      const markers = root.querySelector('[data-markers]'); markers.replaceChildren();
      const max = countries[0]?.visits || 1;
      for (const country of countries) {
        const point = this.geometry.points[country.code];
        if (!point) continue;
        const radius = 3 + 4 * Math.sqrt(country.visits / max);
        const halo = svgElement('circle',{cx:point[0],cy:point[1],r:radius*1.8,class:'halo'});
        const marker = svgElement('circle',{cx:point[0],cy:point[1],r:radius,class:'marker'});
        const title = svgElement('title',{}); title.textContent = `${regionNames.of(country.code)}: ${number.format(country.visits)} visits`;
        marker.append(title); markers.append(halo,marker);
      }
      const message = root.querySelector('.message');
      message.hidden = countries.length > 0;
      message.textContent = data.totalVisits ? 'No geographic data available yet.' : 'No visits recorded yet.';
      const status = root.querySelector('.status');
      status.hidden = !data.unknownVisits;
      status.textContent = `${number.format(data.unknownVisits)} visits with unknown location`;
    } catch { this.fail(); }
    finally { this.loading = false; }
  }
}

if (!customElements.get('visitor-stats')) customElements.define('visitor-stats', VisitorStats);

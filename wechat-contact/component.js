class WeChatContact extends HTMLElement {
  connectedCallback() {
    if (this.events) return;
    this.events = new AbortController();
    const { signal } = this.events;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const source = this.getAttribute('qr-src') || 'QRcode.png';

    root.innerHTML = `
      <style>
        :host { display: inline-block; font: inherit; }
        * { box-sizing: border-box; }
        button { font: inherit; cursor: pointer; }
        .trigger { border: 0; padding: 0; background: none; color: #1772d0; line-height: inherit; }
        .trigger:hover, .trigger[aria-expanded="true"] { color: #f09228; }
        :focus-visible { outline: 2px solid #1772d0; outline-offset: 4px; border-radius: 3px; }
        .panel {
          position: fixed; inset: auto; margin: 0; visibility: hidden;
          width: min(260px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
          overflow: auto; padding: 16px 18px 18px; border: 1px solid #e1e8ef;
          border-radius: 16px; background: #fff; color: #283645;
          box-shadow: 0 12px 36px rgb(40 54 69 / 14%), 0 2px 8px rgb(40 54 69 / 5%);
          font: 14px/1.4 'Lato', Verdana, Helvetica, sans-serif; text-align: left;
        }
        .panel[data-positioned] { visibility: visible; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        h2 { margin: 0; font-size: 15px; font-weight: 700; }
        .close { display: grid; place-items: center; width: 32px; height: 32px;
          margin: -4px -6px -4px 0; padding: 0; border: 0; border-radius: 8px;
          background: none; color: #788593; font: 24px/1 Arial, sans-serif; }
        .close:hover { color: #283645; background: #f3f7fb; }
        img { display: block; width: 100%; height: auto; margin-top: 14px; }
        p { margin: 12px 0 0; color: #697784; font-size: 12px; text-align: center; }
        .error { color: #a33327; }
        [hidden] { display: none !important; }
        @media (max-width: 640px) {
          .trigger { display: inline-flex; align-items: center; justify-content: center;
            min-height: 44px; min-width: 54px; vertical-align: middle; }
          .close { width: 44px; height: 44px; }
        }
      </style>
      <button class="trigger" type="button" popovertarget="wechat-qr"
        aria-haspopup="dialog" aria-controls="wechat-qr" aria-expanded="false">WeChat</button>
      <section class="panel" id="wechat-qr" popover="auto" role="dialog"
        aria-labelledby="wechat-title" aria-describedby="wechat-caption">
        <div class="header">
          <h2 id="wechat-title">WeChat</h2>
          <button class="close" type="button" popovertarget="wechat-qr"
            popovertargetaction="hide" aria-label="Close WeChat QR code">×</button>
        </div>
        <img width="684" height="664" alt="Jincheng Xiong's WeChat QR code">
        <p id="wechat-caption">Scan with WeChat to add me</p>
        <p class="error" role="status" hidden>QR code could not load. Please try again.</p>
      </section>`;

    const trigger = root.querySelector('.trigger');
    const panel = root.querySelector('.panel');
    const qr = root.querySelector('img');
    const error = root.querySelector('.error');

    // Older browsers can still open the original QR image directly.
    if (!panel.showPopover) {
      const link = document.createElement('a');
      link.textContent = 'WeChat';
      link.href = source;
      link.className = 'trigger';
      trigger.replaceWith(link);
      panel.remove();
      return;
    }

    const position = () => {
      if (!panel.matches(':popover-open')) return;
      const anchor = trigger.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (anchor.bottom < 0 || anchor.top > height) {
        panel.hidePopover();
        return;
      }
      const box = panel.getBoundingClientRect();
      const margin = 12;
      const gap = 12;
      const below = height - anchor.bottom - gap - margin;
      const above = anchor.top - gap - margin;
      const top = below >= box.height || below >= above
        ? anchor.bottom + gap : anchor.top - gap - box.height;
      panel.style.left = `${Math.max(margin, Math.min(anchor.left + anchor.width / 2 - box.width / 2, width - box.width - margin))}px`;
      panel.style.top = `${Math.max(margin, Math.min(top, height - box.height - margin))}px`;
      panel.setAttribute('data-positioned', '');
    };

    panel.addEventListener('beforetoggle', (event) => {
      const opening = event.newState === 'open';
      trigger.setAttribute('aria-expanded', String(opening));
      panel.removeAttribute('data-positioned');
      if (opening) {
        if (!qr.getAttribute('src') || error.hidden === false) {
          error.hidden = true;
          qr.src = source;
        }
        queueMicrotask(position);
      }
    }, { signal });
    panel.addEventListener('toggle', (event) => {
      if (event.newState === 'open') position();
    }, { signal });
    qr.addEventListener('load', position, { signal });
    qr.addEventListener('error', () => { error.hidden = false; position(); }, { signal });

    const schedulePosition = () => {
      if (this.frame || !panel.matches(':popover-open')) return;
      this.frame = requestAnimationFrame(() => { this.frame = null; position(); });
    };
    window.addEventListener('resize', schedulePosition, { signal });
    window.addEventListener('scroll', schedulePosition, { capture: true, passive: true, signal });
  }

  disconnectedCallback() {
    this.events?.abort();
    this.events = null;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

if (!customElements.get('wechat-contact')) customElements.define('wechat-contact', WeChatContact);

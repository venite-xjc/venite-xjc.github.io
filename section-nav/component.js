const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'news', label: 'News' },
  { id: 'research', label: 'Research' },
  { id: 'projects', label: 'Projects' },
  { id: 'honors', label: 'Honors' },
];

class SectionNav extends HTMLElement {
  connectedCallback() {
    if (this.events) return;
    this.events = new AbortController();
    const { signal } = this.events;
    this.compact = matchMedia('(max-width: 1099px)');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.sections = SECTIONS.map(section => ({
      ...section, target: document.getElementById(section.id),
    })).filter(section => section.target);

    this.innerHTML = `
      <nav class="toc-panel" aria-label="Page sections">
        <div class="toc-scroll">
          <div class="toc-track">
            <div class="toc-indicator" aria-hidden="true"></div>
            <ul class="toc-list">
              ${this.sections.map(({ id, label }) => `<li><a class="toc-link" href="#${id}">${label}</a></li>`).join('')}
            </ul>
          </div>
        </div>
      </nav>`;
    this.panel = this.querySelector('.toc-panel');
    this.scroller = this.querySelector('.toc-scroll');
    this.track = this.querySelector('.toc-track');
    this.indicator = this.querySelector('.toc-indicator');
    this.sections.forEach(section => {
      section.link = this.querySelector(`a[href="#${section.id}"]`);
      section.target.setAttribute('data-section-nav-target', '');
    });

    this.addEventListener('click', event => {
      const link = event.target.closest('.toc-link');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      this.interacted = true;
      this.navigate(link.hash.slice(1), true);
    }, { signal });

    window.addEventListener('scroll', () => {
      if (this.landing && Math.abs(scrollY - this.landing.y) > 2) this.landing = null;
      this.schedule();
    }, { passive: true, signal });
    window.addEventListener('scrollend', () => this.finishNavigation(), { signal });
    window.addEventListener('resize', () => this.layoutChanged(), { passive: true, signal });
    window.addEventListener('hashchange', () => this.navigateFromHash(), { signal });
    window.addEventListener('popstate', () => this.navigateFromHash(), { signal });
    window.addEventListener('wheel', () => this.userScroll(), { passive: true, signal });
    window.addEventListener('touchstart', () => this.userScroll(), { passive: true, signal });
    window.addEventListener('pointerdown', event => {
      if (!this.contains(event.target)) this.userScroll();
    }, { passive: true, signal });
    window.addEventListener('keydown', event => {
      if (!event.target.matches('input, textarea, select, [contenteditable]') &&
          ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
        this.userScroll();
      }
    }, { signal });

    this.observer = new ResizeObserver(() => this.layoutChanged());
    this.observer.observe(this.panel);
    const page = document.querySelector('.page-container');
    if (page) this.observer.observe(page);
    this.sections.forEach(({ target }) => this.observer.observe(target));

    this.layoutChanged();
    this.initialFrame = requestAnimationFrame(() => this.navigateFromHash());
    const correctInitialAnchor = () => {
      if (!this.isConnected) return;
      if (!this.interacted) this.navigateFromHash();
      this.layoutChanged();
    };
    window.addEventListener('load', correctInitialAnchor, { once: true, signal });
    document.fonts?.ready.then(correctInitialAnchor);
  }

  layoutChanged() {
    this.layoutDirty = true;
    this.schedule();
  }

  schedule() {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.update();
      });
    }
  }

  offset() {
    return this.compact.matches ? this.panel.getBoundingClientRect().bottom + 16 : 24;
  }

  destination(target) {
    const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    return Math.max(0, Math.min(target.getBoundingClientRect().top + scrollY - this.offset(), maximum));
  }

  navigate(id, pushHistory = false) {
    const section = this.sections.find(item => item.id === id);
    if (!section || !section.target.getClientRects().length) return;
    clearTimeout(this.navigationTimer);
    this.landing = null;
    const top = this.destination(section.target);
    this.navigation = { id, top };
    this.setActive(id);
    if (pushHistory && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    window.scrollTo({ top, behavior: pushHistory && !this.reducedMotion.matches ? 'smooth' : 'auto' });
    // scrollend is supplemented for browsers that do not implement it.
    this.navigationTimer = setTimeout(() => this.finishNavigation(), 1800);
    this.schedule();
  }

  navigateFromHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    // The Projects image viewer uses the heading's original fragment.
    if (id === 'projects-title') id = 'projects';
    if (id) this.navigate(id);
    else this.schedule();
  }

  finishNavigation() {
    if (!this.navigation) return;
    // Keep a clicked short section selected when the page end limits scrolling.
    this.landing = { id: this.navigation.id, y: scrollY };
    this.navigation = null;
    clearTimeout(this.navigationTimer);
    this.schedule();
  }

  userScroll() {
    this.interacted = true;
    this.navigation = null;
    this.landing = null;
    clearTimeout(this.navigationTimer);
    this.schedule();
  }

  update() {
    if (!this.isConnected) return;
    const offset = this.offset();
    if (offset !== this.lastOffset) {
      document.documentElement.style.setProperty('--section-nav-offset', `${offset}px`);
      this.lastOffset = offset;
    }
    const visible = this.sections.filter(section => {
      const shown = section.target.getClientRects().length > 0 && section.target.getBoundingClientRect().height > 0;
      if (section.link.parentElement.hidden === shown) {
        section.link.parentElement.hidden = !shown;
        this.layoutDirty = true;
      }
      return shown;
    });
    if (!visible.length) return;

    let id;
    if (this.navigation) {
      id = this.navigation.id;
      if (Math.abs(scrollY - this.navigation.top) < 2) this.finishNavigation();
    } else if (this.landing) {
      id = this.landing.id;
    } else {
      const readingLine = offset + Math.min(120, innerHeight * .2);
      id = visible[0].id;
      for (const section of visible) {
        if (section.target.getBoundingClientRect().top <= readingLine) id = section.id;
      }
      if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
        id = visible.at(-1).id;
      }
    }
    this.setActive(id, this.layoutDirty);
    this.layoutDirty = false;
  }

  setActive(id, force = false) {
    if (id === this.activeId && !force) return;
    const section = this.sections.find(item => item.id === id);
    if (!section) return;
    this.activeId = id;
    this.sections.forEach(item => {
      if (item.id === id) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
    const linkRect = section.link.getBoundingClientRect();
    const trackRect = this.track.getBoundingClientRect();
    this.indicator.style.width = `${linkRect.width}px`;
    this.indicator.style.height = `${linkRect.height}px`;
    this.indicator.style.transform = `translate3d(${linkRect.left - trackRect.left}px, ${linkRect.top - trackRect.top}px, 0)`;
    this.setAttribute('data-ready', '');

    if (this.compact.matches) {
      const viewport = this.scroller.getBoundingClientRect();
      if (linkRect.left < viewport.left + 4 || linkRect.right > viewport.right - 4) {
        this.scroller.scrollTo({
          left: this.scroller.scrollLeft + linkRect.left - viewport.left - (viewport.width - linkRect.width) / 2,
          behavior: this.reducedMotion.matches || force ? 'auto' : 'smooth',
        });
      }
    }
  }

  disconnectedCallback() {
    this.events?.abort();
    this.events = null;
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.initialFrame);
    clearTimeout(this.navigationTimer);
    this.frame = null;
    this.activeId = null;
    this.lastOffset = null;
    this.interacted = false;
    this.navigation = null;
    this.landing = null;
    this.sections?.forEach(({ target }) => target.removeAttribute('data-section-nav-target'));
    document.documentElement.style.removeProperty('--section-nav-offset');
  }
}

if (!customElements.get('section-nav')) customElements.define('section-nav', SectionNav);

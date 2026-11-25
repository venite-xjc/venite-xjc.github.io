import { highlightSectionTitles } from '../section-titles/component.js';

const asset = (name) => new URL(`./assets/${name}`, import.meta.url).href;

class HomepageProjects extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <section class="projects-section section-cell" aria-labelledby="projects-title">
        <h2 id="projects-title">Projects</h2>
        <div class="projects-list">
          <article class="project-row" aria-labelledby="supertrack-title">
            <a class="project-media project-media--supertrack" href="https://www.theorangeduck.com/page/supertrack-motion-tracking-physically-simulated-characters-using-supervised-learning"
              target="_blank" rel="noopener noreferrer" aria-label="View the original SuperTrack project">
              <img src="${asset('supertrack-teaser.png')}" width="370" height="120"
                alt="SuperTrack teaser showing predicted character motion" loading="lazy" decoding="async">
            </a>
            <div class="project-info">
              <div class="project-heading">
                <h3 id="supertrack-title"><a href="https://github.com/venite-xjc/SuperTrack">SuperTrack</a></h3>
                <a class="project-stars" href="https://github.com/venite-xjc/SuperTrack" target="_blank" rel="noopener noreferrer">
                  <img src="https://img.shields.io/github/stars/venite-xjc/SuperTrack?style=flat-square&amp;logo=github&amp;logoColor=64748b&amp;label=Stars&amp;labelColor=f1f5f9&amp;color=dbeafe"
                    alt="SuperTrack GitHub stars" height="20" loading="lazy">
                </a>
              </div>
              <p>An unofficial reproduction of
                <a href="https://theorangeduck.com/media/uploads/other_stuff/SuperTrack.pdf">SuperTrack</a>,
                implemented in 2023.</p>
            </div>
          </article>
          <article class="project-row" aria-labelledby="castle-title">
            <a class="project-media project-media--charts" href="${new URL('./benchmark.html', import.meta.url).href}" target="_blank" rel="noopener noreferrer"
              aria-label="View the full CASTLE training time and GPU memory charts">
              <img src="${asset('castle-performance.png')}" width="1440" height="1440"
                alt="CASTLE training time on an A100: Triton compared with dense PyTorch and FlexAttention"
                loading="lazy" decoding="async">
              <img src="${asset('castle-memory.png')}" width="1440" height="1440"
                alt="CASTLE peak GPU memory on an A100: Triton compared with dense PyTorch and FlexAttention"
                loading="lazy" decoding="async">
            </a>
            <div class="project-info">
              <div class="project-heading">
                <h3 id="castle-title"><a href="https://github.com/venite-xjc/castle-triton">CASTLE Attention in Triton</a></h3>
                <a class="project-stars" href="https://github.com/venite-xjc/castle-triton" target="_blank" rel="noopener noreferrer">
                  <img src="https://img.shields.io/github/stars/venite-xjc/castle-triton?style=flat-square&amp;logo=github&amp;logoColor=64748b&amp;label=Stars&amp;labelColor=f1f5f9&amp;color=dbeafe"
                    alt="CASTLE Triton GitHub stars" height="20" loading="lazy">
                </a>
              </div>
              <p>A Triton reproduction of
                <a href="https://arxiv.org/abs/2509.07301">CASTLE Attention (Lookahead Attention)</a>,
                with <strong>14.88× training speedup</strong> and
                <strong>54.57× lower incremental peak GPU memory</strong>.</p>
              <p class="project-benchmark"><a href="https://github.com/venite-xjc/castle-triton/blob/main/reports/bf16_h16d64_w64/REPORT.md">Benchmark</a>:
                A100 · 10K BF16 tokens · window 64 · vs. dense PyTorch.</p>
            </div>
          </article>
        </div>
      </section>`;
    this.annotations = highlightSectionTitles(this);
  }

  disconnectedCallback() {
    this.annotations?.forEach((annotation) => annotation.remove());
    this.annotations = [];
  }
}

if (!customElements.get('homepage-projects')) {
  customElements.define('homepage-projects', HomepageProjects);
}

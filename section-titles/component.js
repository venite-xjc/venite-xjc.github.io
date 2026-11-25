import { annotate } from './vendor/rough-notation-0.5.1.esm.js';

export function highlightSectionTitles(root = document) {
  const annotations = [];

  root.querySelectorAll('.section-cell > h2').forEach((heading) => {
    if (heading.classList.contains('section-title--annotated')) return;

    // Keep the SVG inside the heading, so changes above it cannot detach the mark.
    const text = document.createElement('span');
    text.className = 'section-title-text';
    text.append(...heading.childNodes);
    heading.append(text);

    const annotation = annotate(text, {
      type: 'highlight',
      color: 'rgba(157, 187, 216, 0.28)',
      iterations: 2,
      animate: false,
    });
    const svg = text.previousElementSibling;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    annotation.show();
    heading.classList.add('section-title--annotated');
    annotations.push(annotation);
  });

  // Refresh after web fonts settle; the library also observes subsequent resizes.
  document.fonts?.ready.then(() => {
    annotations.forEach((annotation) => {
      if (annotation.isShowing()) annotation.show();
    });
  });
  return annotations;
}

highlightSectionTitles();

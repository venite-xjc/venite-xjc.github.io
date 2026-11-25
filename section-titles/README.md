# Section title highlights

`section-titles.css` styles the News, Research and Honors headings.
`component.js` adds a full-height, two-pass hand-drawn highlight with Rough Notation.
The page only needs the stylesheet and module entry points; heading markup stays unchanged.

Highlights render immediately without animation, refresh after web fonts load,
and follow heading size changes. The CSS background remains as a fallback when
JavaScript is unavailable. The title font uses the site's existing 22px heading style.

The library is hosted locally to avoid a runtime CDN dependency:

- Package: `rough-notation@0.5.1`
- Source: https://github.com/rough-stuff/rough-notation
- Distribution: https://registry.npmjs.org/rough-notation/-/rough-notation-0.5.1.tgz
- License: MIT, included at `vendor/rough-notation.LICENSE`
- `vendor/rough-notation-0.5.1.esm.js` is the unmodified npm ES module build.

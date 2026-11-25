# Mobile layout

Phone refinements live in `component.css`, loaded after the existing component
styles. Both the stylesheet link and its rules are restricted to viewport widths
of 640px or less, so desktop/tablet layout is unaffected.

The same page structure, section order, colors and title treatment are retained:
headings and paper cards gain edge spacing; contact links get predictable rows
and larger touch areas; award years occupy a consistent second line. Projects
retain the 25% image column, with the two CASTLE charts stacked inside that column
at 480px and below. Wider mobile layouts keep the charts side by side.

The WeChat and visitor components use shadow DOM; their phone-only rules remain
inside those components. After changing visitor styles, run `npm run build` in
`visitor-stats/` to regenerate its bundled module. Video `playsinline` attributes
allow the existing previews to play within the page on mobile browsers.

# Section navigation

`<section-nav>` adds a fixed table of contents for About, News, Research,
Projects and Honors. The homepage only imports the stylesheet/module,
inserts the custom element and supplies stable IDs on section containers.

- At 1100px and above, the navigation sits to the left of the existing 800px page.
- Narrower screens use a fixed horizontal top bar, with space reserved above the
  content. The active link scrolls into view within the bar when necessary.
- Manual page scrolling selects the current section and moves a plain pale-blue
  indicator, without an accent border or a separate navigation caption.
- Links scroll to their section with a header offset and add a shareable fragment
  to browser history. Back/forward navigation and initial fragments are supported.
- Reduced-motion settings disable smooth scrolling and indicator transitions.
- Updates are scheduled once per animation frame. ResizeObserver accounts for
  language changes, media loading and asynchronously rendered components.

The script only changes history for explicit navigation clicks, never while
reading/scrolling. `aria-current="location"`, native links and visible focus
outlines retain keyboard and screen-reader navigation.

To add another section, give its container a unique ID and extend `SECTIONS`
in `component.js`. The breakpoint is shared by that module and the stylesheet.

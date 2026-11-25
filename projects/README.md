# Homepage projects

`component.js` defines `<homepage-projects>` with two project rows. Layout and
typography live in the scoped `component.css`; images are in `assets/`.
The homepage only imports the stylesheet/module and inserts the custom element.
The Projects heading reuses the shared section-title highlight helper.

The image column takes one quarter of the available row width, excluding its gap.
SuperTrack fills the image column in a 2:1 frame, using a centered crop to remove
excess horizontal background without stretching the character. CASTLE's timing and memory
charts appear together as one side-by-side preview, linking to `benchmark.html`
for a larger view of both original charts. Star badges use the same live
Shields.io styling as Research.

## Content and image sources

- SuperTrack implementation: https://github.com/venite-xjc/SuperTrack
- SuperTrack paper: https://theorangeduck.com/media/uploads/other_stuff/SuperTrack.pdf
- SuperTrack teaser: https://www.theorangeduck.com/media/uploads/publication_supertrack.png
  (the authors' publication thumbnail; reproduced without modification).
- CASTLE implementation: https://github.com/venite-xjc/castle-triton
- CASTLE paper: https://arxiv.org/abs/2509.07301
- CASTLE performance chart: https://raw.githubusercontent.com/venite-xjc/castle-triton/main/reports/bf16_h16d64_w64/timing_stacked.png
  (copied without modification).
- CASTLE memory chart: https://raw.githubusercontent.com/venite-xjc/castle-triton/main/reports/bf16_h16d64_w64/peak_memory.png
  (copied without modification).
- Benchmark: https://github.com/venite-xjc/castle-triton/blob/main/reports/bf16_h16d64_w64/REPORT.md

At 10,000 BF16 tokens on A100, batch 1, H=16, D=64 and window=64, the report gives
14.88× total forward/backward speedup versus dense PyTorch. Incremental peak GPU
memory is 33,897.8 MiB versus 621.2 MiB: a ratio of 54.5683, displayed as 54.57×.
These are benchmark-specific figures, not a claim for every input size.

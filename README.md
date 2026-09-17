# zpgraph

<p align="center">
  <strong>Fast, typed, interactive timeseries charts for the modern web.</strong><br />
  Spiritual successor to <a href="https://github.com/danvk/dygraphs">dygraphs</a> —
  same DNA, TypeScript core, ESM/CJS/IIFE builds.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zpgraph"><img alt="npm" src="https://img.shields.io/npm/v/zpgraph.svg?color=1b6b93" /></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0d1b2a" />
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-strict-1b6b93" />
</p>

<p align="center">
  <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/basic.png" alt="Basic timeseries demo" width="920" />
</p>

---

## Why zpgraph?

Dygraphs proved that a lean canvas chart can feel instant on dense data.
zpgraph keeps that interaction model and rebuilds the stack for today:

- **TypeScript end-to-end** — `ZpgraphOptions`, `Point`, plugins and callbacks are
  typed. A typo in an option name is a compile error, not a silent noop.
- **Modern package surface** — ESM + CJS + browser IIFE, separate CSS import,
  optional extras under `zpgraph/extras/*`.
- **Interaction that scales** — drag-zoom, pan, animated zooms, range selector,
  keyboard selection, Shift+arrows for pan/zoom.
- **Large series friendly** — min-max decimation before layout, while selection
  APIs still index the full raw data.
- **CSP-aware defaults** — built-in UI styles via CSSOM; prefer
  `DocumentFragment` formatters under strict CSP.
- **Familiar if you know dygraphs** — `updateOptions`, `xAxisRange`,
  `resetZoom`, annotations, dual axes… renamed, not reinvented.

---

## Install

```bash
npm install zpgraph
```

```ts
import Zpgraph from "zpgraph";

const g = new Zpgraph("chart", data, {
  labels: ["Date", "Alpha", "Beta"],
  legend: "always",
  animatedZooms: true,
});
```

CSS inject automatic on chart create (`ensureZpgraphStyles`). Optional still:
`import "zpgraph/style.css"` if prefer bundler-managed stylesheet.

Browser IIFE (CSS injected by the script):

```html
<script src="node_modules/zpgraph/dist/zpgraph.min.global.js"></script>
```

---

## Gallery

Screenshots from the live demos. Run them yourself with
`npm run build && npx serve .` → open [`/demos/`](https://github.com/joaovitorzeppe/zpgraph/tree/main/core/demos).

<table>
  <tr>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/two-axes.png" alt="Two y-axes" />
      <p><b>Two y-axes</b> — independent scales for mixed magnitudes.</p>
    </td>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/range-selector.png" alt="Range selector" />
      <p><b>Range selector</b> — minimap + custom high/low bars.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/stacked-fill.png" alt="Stacked fill" />
      <p><b>Stacked fill</b> — area stacks with fill under the curve.</p>
    </td>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/underlay.png" alt="Underlay bands" />
      <p><b>Underlay</b> — paint bands behind series with <code>underlayCallback</code>.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/annotations.png" alt="Annotations" />
      <p><b>Annotations</b> — markers on points; click to add more.</p>
    </td>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/highlight-series.png" alt="Highlight series" />
      <p><b>Highlight series</b> — emphasize the hovered series.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/random-dataset.png" alt="Random dataset swap" />
      <p><b>Random dataset</b> — swap the entire <code>file</code> on a button click.</p>
    </td>
    <td width="50%">
      <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/crosshair.png" alt="Crosshair" />
      <p><b>Crosshair</b> — extra plugin for selection crosshairs.</p>
    </td>
  </tr>
</table>

<p align="center">
  <img src="https://unpkg.com/zpgraph@0.1.0/demos/screenshots/synchronize.png" alt="Synchronized charts" width="920" />
  <br />
  <b>Synchronize</b> — linked zoom and selection across charts
  (<code>zpgraph/extras/synchronizer</code>).
</p>

### More demos

The [`demos/`](https://github.com/joaovitorzeppe/zpgraph/tree/main/core/demos) folder also includes:

- Live **dynamic update** (append a point every second)
- **Error bars** (`[value, stddev]`)
- **Per-series** stroke / points / fill
- Gallery index with one-click links to every example

---

## Typed by default

zpgraph ships with declaration files. Options are a closed interface — no
`[key: string]: any` escape hatch — so editors catch mistakes early:

```ts
import Zpgraph, { type ZpgraphOptions } from "zpgraph";

const opts = {
  labels: ["x", "A"],
  legend: "always",
  underlayCallback: (ctx, area, g) => {
    // `g` is typed as Zpgraph
    const y = g.toDomYCoord(20);
  },
} satisfies ZpgraphOptions;

new Zpgraph(el, data, opts);
```

`typescript/no-explicit-any` is enforced on library sources. You get IntelliSense
for series options, axes, plugins and the public chart API.

---

## Features at a glance

| Area          | What you get                                                        |
| ------------- | ------------------------------------------------------------------- |
| Data          | Arrays, CSV strings, async `file` via `fetch`, custom data handlers |
| Series        | Multi-series, stacked, fill, error/custom bars, per-series styles   |
| Axes          | Dual y-axes, log scales, tickers, formatters                        |
| Interaction   | Zoom, pan, range selector, touch, keyboard, synchronized charts     |
| Overlay       | Annotations, underlay/draw callbacks, hairlines / super-annotations |
| Accessibility | `role="img"`, live legend, focusable chart, Shift+arrows pan/zoom   |
| Packaging     | ESM / CJS / IIFE, tree-shakeable extras, injectable `setLogger`     |

---

## Package surface

| Export              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `zpgraph`           | Chart class, plugins, types, `utils`, `tickers` |
| `zpgraph/style.css` | Chart CSS (optional; also auto-injected)        |
| `zpgraph/extras/*`  | Optional plugins (crosshair, synchronizer, …)   |

`utils` is a documented subset (stroke patterns, shapes, default formatters).
Internals such as `toRGB_` are not part of the public surface.

DOM class prefix remains `zpgraph-*` (API/event field `e.zpgraph`) so existing
CSS and mental models stay stable.

---

## Content Security Policy

Built-in plugins style through the CSSOM, so they work under
`style-src 'self'` without `unsafe-inline`.

Prefer `legendFormatter` returning a `DocumentFragment` or `Node`. A **string**
return is treated as trusted application HTML (may need `unsafe-inline` for
that path). User templates for extras (`#hairline-template`, …) belong to the
page.

---

## Migrating from dygraphs

| dygraphs                   | zpgraph                   |
| -------------------------- | ------------------------- |
| `import … from 'dygraphs'` | `import … from 'zpgraph'` |
| `new Dygraph(...)`         | `new Zpgraph(...)`        |
| `dygraph.css`              | `zpgraph/style.css`       |
| Classes `dygraph-*`        | `zpgraph-*`               |
| Event prop `e.dygraph`     | `e.zpgraph`               |

API shape is familiar; **compatibility is not guaranteed**. Prefer
`ZpgraphOptions` and re-test interactions after migrate.

---

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
npx serve .   # → /demos/
```

Vanilla library first. Framework wrappers will live as sibling packages later.

## License

MIT — [LICENSE](LICENSE). Dygraphs attribution in [NOTICE](NOTICE).

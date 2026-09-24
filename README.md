# zpgraph

<p align="center">
  <strong>Fast, typed, interactive timeseries charts for the modern web.</strong><br />
  Spiritual successor to <a href="https://github.com/danvk/dygraphs">dygraphs</a> —
  same DNA, TypeScript core, ESM builds.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zpgraph"><img alt="npm" src="https://img.shields.io/npm/v/zpgraph.svg?color=1b6b93" /></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-0d1b2a" />
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-strict-1b6b93" />
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/basic.png" alt="Basic timeseries demo" width="920" />
</p>

---

## Why zpgraph?

Dygraphs proved that a lean canvas chart can feel instant on dense data.
zpgraph keeps that interaction model and rebuilds the stack for today:

- **TypeScript end-to-end** — `ZpgraphOptions`, `Point`, plugins and callbacks are
  typed. A typo in an option name is a compile error, not a silent noop.
- **Modern package surface** — ESM only,
  optional extras under `zpgraph/extras/*`.
- **Interaction that scales** — drag-zoom, pan, animated zooms, range selector,
  keyboard selection, Shift+arrows for pan/zoom.
- **Large series friendly** — min-max decimation before layout, while selection
  APIs still index the full raw data.
- **CSP-aware defaults** — built-in UI styles via CSSOM; prefer
  `DocumentFragment` formatters under strict CSP.
- **Label style** — DOM labels take `LabelStyle` (`className` / `style`),
  chart-level `classNames.*`, and CSS vars (`--zp-*`). React can
  override with `render*Label` ReactNodes.
- **Familiar if you know dygraphs** — `updateOptions`, `xAxisRange`,
  `resetZoom`, annotations, dual axes… renamed, not reinvented.

---

## Install

```bash
npm install zpgraph
```

```ts
import { Zpgraph } from "zpgraph";

const g = new Zpgraph("chart", data, {
  labels: ["Date", "Alpha", "Beta"],
  tooltip: { show: "always" },
  animatedZooms: true,
});
```

Vanilla HTML (no bundler). jsDelivr serves the npm ESM (`+esm`). CSS is injected; no stylesheet link.

```html
<script type="module">
  import { Zpgraph } from "https://cdn.jsdelivr.net/npm/zpgraph@1.4.0/+esm";
  new Zpgraph("chart", data, { labels: ["Date", "Alpha"] });
</script>
```

Local `node_modules`

```html
<script type="importmap">
  { "imports": { "zpgraph": "./node_modules/zpgraph/dist/index.js" } }
</script>
<script type="module">
  import { Zpgraph } from "zpgraph";
  new Zpgraph("chart", data, { labels: ["Date", "Alpha"] });
</script>
```

---

## Gallery

Screenshots from the live demos. Open [`demos/`](https://github.com/joaovitorzeppe/zpgraph/tree/main/demos).

<table>
  <tr>
    <td width="50%">
      <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/two-axes.png" alt="Two y-axes" />
      <p><b>Two y-axes</b> — independent scales for mixed magnitudes.</p>
    </td>
    <td width="50%">
      <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/range-selector.png" alt="Range selector" />
      <p><b>Range selector</b> — minimap + custom high/low bars.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/stacked-fill.png" alt="Stacked fill" />
      <p><b>Stacked fill</b> — area stacks with fill under the curve.</p>
    </td>
    <td width="50%">
      <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/underlay.png" alt="Underlay bands" />
      <p><b>Underlay</b> — paint bands behind series with <code>underlayCallback</code>.</p>
    </td>
  </tr>
</table>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/joaovitorzeppe/zpgraph@main/demos/screenshots/synchronize.png" alt="Synchronized charts" width="920" />
  <br />
  <b>Synchronize</b> — linked zoom and selection across charts
  (<code>zpgraph/extras/synchronizer</code>).
</p>

### More demos

The [`demos/`](https://github.com/joaovitorzeppe/zpgraph/tree/main/demos) folder also includes:

- Live **dynamic update** (append a point every second)
- **Error bars** (`[value, stddev]`)
- **Per-series** stroke / points / fill
- And more!

---

## Typed by default

zpgraph ships with declaration files.

```ts
import Zpgraph, { type ZpgraphOptions } from "zpgraph";

const opts = {
  labels: ["x", "A"],
  tooltip: { show: "always" },
  underlayCallback: (ctx, area, g) => {
    // `g` is typed as Zpgraph
    const y = g.toDomYCoord(20);
  },
} satisfies ZpgraphOptions;

new Zpgraph(el, data, opts);
```

---

## Features at a glance

| Area          | What you get                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Data          | Arrays, CSV strings, async `file` via `fetch`, custom data handlers                                                 |
| Series        | Multi-series, stacked, fill, error/custom bars, per-series styles                                                   |
| Axes          | Dual y-axes, log scales, tickers, formatters                                                                        |
| Interaction   | Zoom, pan, range selector, touch, keyboard, synchronized charts                                                     |
| Overlay       | Annotations, underlay/draw callbacks, hairlines / super-annotations                                                 |
| Accessibility | `role="img"`, live legend, focusable chart, Shift+arrows pan/zoom; optional `keyboard` extra for plain arrows / +/- |
| Packaging     | ESM, tree-shakeable extras, injectable `setLogger`                                                                  |

---

## Package surface

| Export             | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `zpgraph`          | Chart class, plugins, types, `utils`, `tickers` |
| `zpgraph/extras/*` | Optional plugins/plotters (see list below)      |

### Extras (`zpgraph/extras/<name>`)

| Extra               | Role                                                         |
| ------------------- | ------------------------------------------------------------ |
| `crosshair`         | Crosshair on selection                                       |
| `hairlines`         | Clickable vertical markers                                   |
| `super-annotations` | Draggable annotation cards                                   |
| `synchronizer`      | Linked zoom/selection                                        |
| `unzoom`            | Hover reset button                                           |
| `rebase`            | Percent change from first point                              |
| `shapes`            | Extra point markers                                          |
| `smooth-plotter`    | Bezier series                                                |
| `locale`            | Locale packs pt/en/es + `applyLocale`                        |
| `zoom-limits`       | Min/max x-span + clamp to data                               |
| `measure`           | Two-click Δx/Δy ruler                                        |
| `keyboard`          | Arrows pan / +/- zoom / Esc (focus chart; zoom first to pan) |
| `brush-select`      | Drag range → callback                                        |
| `url-sync`          | `dateWindow` ↔ URL params                                    |
| `moving-average`    | Overlay MA plotter                                           |
| `fill-between`      | Fill band between two series                                 |
| `span-bands`        | X-axis status strips + canvas labels                         |

`utils` is a documented subset (stroke patterns, shapes, default formatters).
Internals such as `toRGB_` are not part of the public surface.

DOM class prefix remains `zpgraph-*` (API/event field `e.zpgraph`) so existing
CSS and mental models stay stable.

---

## DOM chrome tokens

Override on `.zpgraph` (or a parent). Canvas paint (series, grid, axis lines)
stays on options / `theme` — not CSS vars.

| Group                      | Tokens                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| Legend / tooltip           | `--zp-legend-bg`, `-fg`, `-shadow`, `-padding`, `-radius`, `-font-size` |
| Axis ticks                 | `--zp-axis-label`, `-font-size`, `-opacity`, `-y-padding-end`           |
| Title / chart labels       | `--zp-title-fg`, `-font-weight`, `--zp-chart-label-fg`, `-opacity`      |
| Annotations                | `--zp-annotation-bg`, `-border`, `-fg`, `-padding`, `-font-size`        |
| Status (noData / loading)  | `--zp-status-fg`, `-bg`, `-font-size`                                   |
| Toolbar                    | `--zp-toolbar-*`, `--zp-toolbar-btn-*`                                  |
| Focus                      | `--zp-focus-ring`                                                       |
| Threshold / span / measure | `--zp-threshold-*`, `--zp-span-band-label-*`, `--zp-measure-label-*`    |

Dark preset: `theme: "dark"` or `[data-theme="dark"]` on an ancestor.
Example: [`demos/theme-custom.html`](demos/theme-custom.html).

Option groups (flat API — no nesting): **canvas chrome** (`axisLineColor`,
`gridLineColor`, `theme`, …), **series paint** (`colors`, `strokeWidth`, …),
**DOM chrome** (`classNames`, CSS vars, `LabelStyle`), **interaction**
(`toolbar`, `tooltip`, extras).

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

Vanilla library first.

| Framework | package                                                          |
| --------- | ---------------------------------------------------------------- |
| React     | [react-zpgraph](https://github.com/joaovitorzeppe/react-zpgraph) |

## License

MIT — [LICENSE](LICENSE). Dygraphs attribution in [NOTICE](NOTICE).

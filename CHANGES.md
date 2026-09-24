# Changes

## 1.4.0

- Bug fixes: stacked NaN fill, idempotent destroy, selection with hidden series, log x coordinates, responsive restore, CSV quotes/BOM, decimation of stacked and error bands, ticker edge cases, extras teardown
- Security: formula-safe CSV, legend HTML opt-in (`legendHtml`), toolbar icons are nodes, label styles reject `url()`
- Styles inject automatically inside `@layer zpgraph` (no CSS import). `injectStyles: false` and `styleNonce` opt out
- Default plugins are Legend, Axes, ChartLabels, Annotations and Grid. Toolbar, RangeSelector, Thresholds, ChartAnnotations, DataLabels and StatusOverlay are opt-in
- Named import only: `import { Zpgraph } from "zpgraph"`. Extras barrel: `zpgraph/extras`
- Removed the DOM roller (`showRoller`). `rollPeriod` stays
- `Zpgraph.VERSION` matches the package version

## 1.3.1

- Build: `tsdown` only (drop `tsc` emit + `fix-dts-extensions`)
- Ship `style.css` via tsdown `copy` (+ `style.css.d.ts` for typed imports)
- No source maps / declaration maps in the package
- Slimmer `gen-style-text` script (runtime CSS inject only)

## 1.3.0

- Stricter TypeScript surfaces (`InteractionContext`, plugins, getters)
- Type-aware oxlint: eliminate unsafe assertions / arguments; lint clean under new rules
- Safer string option coercion and interaction/plugin `this` binding fixes

## 1.2.2

- Build with `tsdown` instead of `tsup`
- Package checks: `publint` + `attw` (`npm run check:pkg`)
- Emit `.d.ts` with `.js` relative import extensions (Node16 ESM)
- Keep `style.css` in `dist` after clean (copy CSS after bundle)

## 1.2.1

- Browser without bundler: `<script type="module">` + import map or jsDelivr `+esm`
- Screenshots stay on GitHub (jsDelivr `/gh/`); not in the npm tarball

## 1.2.0

- ESM-only package (dropped CJS and IIFE builds)
- `require('zpgraph')` and `<script src="…/zpgraph.min.global.js">` no longer ship

## 1.1.0

- New Extras
- More customization (DOM CSS tokens)
- Removed `fullscreen` extra
- Fixed `keyboard` extra (arrows no longer fight core selection)

## 1.0.0

- Enforcing oxlint rules for better code quality
- Formatting

## 0.3.0

- Fix various bugs
- Added extra functionalities

## 0.2.0

- Fix various bugs
- Added extra functionalities

## 0.1.0

- Initial Zpgraph release candidate based on dygraphs 2.2.3-alpha sources.

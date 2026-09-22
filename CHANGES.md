# Changes

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

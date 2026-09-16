/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * The supported part of `utils`, published as `zgraph`'s `utils` namespace.
 *
 * `src/utils.ts` also holds internals — `dragGetX_`, `toRGB_`, `setupDOMready_`,
 * event plumbing — that were previously reachable through `export * as utils`.
 * Exporting them froze implementation details as public contract, so the
 * namespace is enumerated here instead.
 */
export {
  // Stroke patterns for `strokePattern`.
  DASHED_LINE,
  DOTTED_LINE,
  DOT_DASH_LINE,
  // Point shapes for `drawPointCallback`.
  Circles,
  // Formatters, for composing with your own.
  dateAxisLabelFormatter,
  dateValueFormatter,
  numberAxisLabelFormatter,
  numberValueFormatter,
  floatFormat,
  // Parsing and general helpers used when writing tickers or plotters.
  binarySearch,
  clone,
  dateParser,
  isNonZeroNonNan,
  update,
  updateDeep,
} from './utils';

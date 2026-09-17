/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Zpgraph — modern TypeScript charting library
 * Spiritual successor to dygraphs (MIT).
 */

// No CSS import here on purpose: a side-effect `import './style.css'` in the
// package entry makes `import Zpgraph from 'zpgraph'` throw in plain Node and in
// SSR. Load `zpgraph/style.css` from application code instead.

export { default } from "./zpgraph";
export { default as Zpgraph } from "./zpgraph";

export type {
  Annotation,
  AnnotationHandler,
  AxisLabelFormatter,
  AxisName,
  AxisOptions,
  ChartClassNames,
  Data,
  DataArray,
  DrawPointCallback,
  InteractionContext,
  InteractionModel,
  LegendData,
  PerSeriesOptions,
  Plotter,
  PlotterEvent,
  Plugin,
  Point,
  Ticker,
  ValueFormatter,
  ZpgraphElement,
  ZpgraphOptions,
} from "./types";

export { setLogger } from "./logger";
export type { Logger } from "./logger";

export { themes, applyTheme } from "./themes";
export type { ChartTheme } from "./themes";

export {
  safeCssClasses,
  withClassNames,
  applyRootClassNames,
} from "./class-names";

export * as utils from "./public-utils";
export * as tickers from "./tickers";

export { default as LegendPlugin } from "./plugins/legend";
export { default as AxesPlugin } from "./plugins/axes";
export { default as AnnotationsPlugin } from "./plugins/annotations";
export { default as ChartLabelsPlugin } from "./plugins/chart-labels";
export { default as GridPlugin } from "./plugins/grid";
export { default as RangeSelectorPlugin } from "./plugins/range-selector";

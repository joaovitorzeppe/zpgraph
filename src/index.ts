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
  AxisAnnotation,
  AxisLabelFormatter,
  AxisName,
  AxisOptions,
  ChartAnnotations,
  ChartClassNames,
  ChartStates,
  Data,
  DataArray,
  DataLabelsOptions,
  DrawPointCallback,
  EventMarker,
  FillGradient,
  ForecastOptions,
  InteractionContext,
  InteractionModel,
  LegendData,
  MarkersOptions,
  NoDataOptions,
  PerSeriesOptions,
  Plotter,
  PlotterEvent,
  Plugin,
  Point,
  PointAnnotation,
  ResponsiveRule,
  TextAnnotation,
  ThresholdBand,
  Ticker,
  ToolbarOptions,
  ToolbarStyle,
  ToolbarTool,
  TooltipOptions,
  TooltipPosition,
  ValueFormatter,
  ZpgraphElement,
  ZpgraphOptions,
} from "./types";

export { setLogger } from "./logger";
export type { Logger } from "./logger";

export { themes, applyTheme } from "./themes";
export type { ChartTheme } from "./themes";

export { toPng, toCsv } from "./export-chart";
export type { ToPngOptions, ToCsvOptions } from "./export-chart";

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
export { default as ThresholdsPlugin } from "./plugins/thresholds";
export { default as ChartAnnotationsPlugin } from "./plugins/chart-annotations";
export { default as DataLabelsPlugin } from "./plugins/data-labels";
export { default as ToolbarPlugin } from "./plugins/toolbar";
export { default as StatusOverlayPlugin } from "./plugins/status-overlay";

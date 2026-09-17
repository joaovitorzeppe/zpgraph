/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Pure type definitions for Zpgraph consumers.
 */

import type Zpgraph from "./zpgraph";

/**
 * Extra CSS classes merged onto chart DOM nodes (Tailwind-friendly).
 * Always concatenated after the built-in `zpgraph-*` classes.
 */
export type ChartClassNames = {
  root?: string;
  legend?: string;
  axisLabel?: string;
  annotation?: string;
  title?: string;
  xlabel?: string;
  ylabel?: string;
  y2label?: string;
  toolbar?: string;
  noData?: string;
  loading?: string;
};

/** Horizontal or filled threshold band drawn behind series. */
export type ThresholdBand = {
  y?: number;
  y2?: number;
  yRange?: [number, number];
  axis?: "y1" | "y2";
  color?: string;
  fillColor?: string;
  strokeWidth?: number;
  label?: string;
  labelPosition?: "left" | "right";
};

export type ToolbarTool =
  | "zoomin"
  | "zoomout"
  | "pan"
  | "reset"
  | "downloadPng"
  | "downloadCsv"
  | "copyCsv";

export type ToolbarOptions = {
  tools?: ToolbarTool[];
  position?: "top-right" | "top-left";
};

export type NoDataOptions = {
  text?: string;
};

export type TooltipOptions = {
  shared?: boolean;
  theme?: "light" | "dark";
};

export type FillGradient = {
  from: string;
  to: string;
  opacityFrom?: number;
  opacityTo?: number;
};

export type ChartStates = {
  hover?: {
    filter?: { type: "darken" | "lighten"; value: number };
    dimOthers?: boolean;
  };
};

export type ForecastOptions = {
  count: number;
  dashPattern?: number[];
  strokeWidth?: number;
  opacity?: number;
  forecastStartsAt?: number;
};

export type MarkersOptions = {
  size?: number;
  strokeWidth?: number;
  shape?: "dot" | "square" | "diamond" | "triangle";
};

export type AxisAnnotation = {
  x?: number | string | Date;
  x2?: number | string | Date;
  y?: number;
  y2?: number;
  axis?: "y1" | "y2";
  borderColor?: string;
  fillColor?: string;
  opacity?: number;
  strokeWidth?: number;
  label?: string;
  labelColor?: string;
};

export type PointAnnotation = {
  x: number | string | Date;
  y: number;
  series?: string;
  markerSize?: number;
  markerColor?: string;
  label?: string;
};

export type TextAnnotation = {
  x: number | string | Date;
  y: number;
  text: string;
  color?: string;
};

export type ChartAnnotations = {
  xaxis?: AxisAnnotation[];
  yaxis?: AxisAnnotation[];
  points?: PointAnnotation[];
  texts?: TextAnnotation[];
};

export type EventMarker = {
  x: number | string | Date;
  label?: string;
  icon?: string;
  cssClass?: string;
  series?: string;
};

export type DataArray = Array<Array<number | number[] | Date | null>>;

export type Data =
  | string
  | DataArray
  | (() => DataArray | string)
  | null
  | undefined;

export interface Point {
  idx: number;
  name: string;
  x?: number | null;
  xval?: number | null;
  y?: number | null;
  yval?: number | null;
  y_bottom?: number | null;
  y_top?: number | null;
  y_stacked?: number | null;
  yval_minus?: number | null;
  yval_plus?: number | null;
  yval_stacked?: number | null;
  /** Pixel X set at render time by the canvas plotter. */
  canvasx?: number;
  /** Pixel Y set at render time by the canvas plotter. */
  canvasy?: number;
}

export type DataLabelsOptions = {
  enabled?: boolean;
  formatter?: (y: number | null | undefined, point: Point) => string;
  filter?: { every?: number; minDistancePx?: number };
};

export interface Annotation {
  series: string;
  x: number | string | Date;
  shortText?: string;
  text?: string;
  icon?: string;
  width?: number;
  height?: number;
  cssClass?: string;
  tickHeight?: number;
  tickWidth?: number;
  tickColor?: string;
  attachAtBottom?: boolean;
  clickHandler?: AnnotationHandler;
  mouseOverHandler?: AnnotationHandler;
  mouseOutHandler?: AnnotationHandler;
  dblClickHandler?: AnnotationHandler;
  div?: HTMLElement;
}

export type AnnotationHandler = (
  annotation: Annotation,
  point: Point,
  zpgraph: unknown,
  event: MouseEvent,
) => void;

export type Ticker = (
  min: number,
  max: number,
  pixels: number,
  opts: (name: string) => unknown,
  zpgraph: unknown,
  vals?: number[],
) => Array<{ v: number; label: string; label_v?: number }>;

export type AxisName = "x" | "y" | "y2";

export type AxisLabelFormatter = (
  value: number | Date,
  granularity: number,
  opts: (name: string) => unknown,
  zpgraph: unknown,
) => string;

export type ValueFormatter = (
  value: number,
  opts: (name: string) => unknown,
  seriesName: string,
  zpgraph: unknown,
  row: number,
  col: number,
) => string;

/**
 * Options that can be set per axis, inside `axes: { x: …, y: …, y2: … }`.
 * Every one of them is also accepted at the top level of `ZpgraphOptions`,
 * where it applies to all axes.
 */
export interface AxisOptions {
  axisLabelFormatter?: AxisLabelFormatter;
  axisLabelFontSize?: number;
  axisLabelWidth?: number;
  axisLineColor?: string;
  axisLineWidth?: number;
  axisTickSize?: number;
  digitsAfterDecimal?: number;
  drawAxis?: boolean;
  drawGrid?: boolean;
  gridLineColor?: string;
  gridLinePattern?: number[] | null;
  gridLineWidth?: number;
  independentTicks?: boolean;
  labelsKMB?: boolean;
  labelsKMG2?: boolean;
  labelsUTC?: boolean;
  logscale?: boolean;
  maxNumberWidth?: number;
  pixelsPerLabel?: number;
  sigFigs?: number | null;
  ticker?: Ticker;
  valueFormatter?: ValueFormatter;
  valueRange?: [number | null, number | null] | null;
}

export type DrawPointCallback = (
  g: unknown,
  seriesName: string,
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  pointSize: number,
  idx: number,
) => void;

export interface PerSeriesOptions {
  axis?: "y1" | "y2" | "" | null;
  color?: string | null;
  drawHighlightPointCallback?: DrawPointCallback | null;
  drawPointCallback?: DrawPointCallback | null;
  drawPoints?: boolean | null;
  fillAlpha?: number | null;
  fillGraph?: boolean | null;
  fillGradient?: FillGradient | null;
  highlightCircleSize?: number | null;
  plotter?: Plotter | Plotter[] | null;
  pointSize?: number | null;
  showInRangeSelector?: boolean | null;
  stepPlot?: boolean | null;
  strokeBorderColor?: string | null;
  strokeBorderWidth?: number | null;
  strokePattern?: number[] | null;
  /** Alias of `strokePattern` (ApexCharts naming). */
  strokeDashArray?: number[] | null;
  strokeWidth?: number | null;
}

export interface Plotter {
  (e: PlotterEvent): void;
}

export interface PlotterEvent {
  points: Point[];
  setName: string;
  drawingContext: CanvasRenderingContext2D;
  color: string;
  strokeWidth: number;
  zpgraph: unknown;
  axis: unknown;
  plotArea: { x: number; y: number; w: number; h: number };
  seriesIndex: number;
  seriesCount: number;
  setNames: string[];
}

export interface InteractionModel {
  mousedown?: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  mousemove?: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  mouseup?: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  mouseout?: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  dblclick?: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  mousewheel?: (
    event: WheelEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  touchstart?: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  touchmove?: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  touchend?: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
}

export interface InteractionContext {
  px: number;
  py: number;
  isZooming: boolean;
  isPanning: boolean;
  is2DPan: boolean;
  cancelNextDblclick: boolean;
  initializeMouseDown: (
    event: Event,
    g: unknown,
    context: InteractionContext,
  ) => void;
  [key: string]: unknown;
}

export interface Plugin {
  toString?(): string;
  // Method form keeps param checking bivariant (plugins take ZpgraphInstance).
  // Return is a loose object: handlers are typed per plugin, not via index sig.
  activate(zpgraph: unknown): object | void;
  destroy?(): void;
}

/**
 * Every option the chart understands. There is deliberately no index
 * signature: a typo like `strokeWidht` should be a compile error, and the
 * runtime already rejects unknown option names in development builds.
 * Anything missing here is a gap to fill, not a reason to loosen the type.
 */
export interface ZpgraphOptions extends PerSeriesOptions, AxisOptions {
  labels?: string[];
  colors?: string[];
  colorSaturation?: number;
  colorValue?: number;
  file?: Data;
  dataHandler?: unknown;
  delimiter?: string;
  xValueParser?: ((str: string) => number) | undefined;
  displayAnnotations?: boolean;
  drawAxesAtZero?: boolean;
  highlightSeriesOpts?: PerSeriesOptions | null;
  highlightSeriesBackgroundAlpha?: number;
  highlightSeriesBackgroundColor?: string;
  labelsSeparateLines?: boolean;
  labelsShowZeroValues?: boolean;
  /**
   * Prefer returning a `DocumentFragment` or `Node` (CSSOM-safe).
   * A string is treated as trusted HTML from the app — under a strict CSP
   * (`style-src 'self'` without `unsafe-inline`) that path needs an exception.
   */
  legendFormatter?: (data: LegendData) => string | DocumentFragment | Node;
  panEdgeFraction?: number | null;
  rightGap?: number;
  timingName?: string | null;
  xAxisHeight?: number | null;
  xLabelHeight?: number;
  xRangePad?: number;
  yLabelWidth?: number;
  yRangePad?: number | null;
  titleHeight?: number;
  rangeSelectorAlpha?: number;
  rangeSelectorBackgroundLineWidth?: number;
  rangeSelectorBackgroundStrokeColor?: string;
  rangeSelectorForegroundLineWidth?: number;
  rangeSelectorForegroundStrokeColor?: string;
  rangeSelectorPlotFillColor?: string;
  rangeSelectorPlotFillGradientColor?: string;
  rangeSelectorPlotLineWidth?: number;
  rangeSelectorPlotStrokeColor?: string;
  rangeSelectorVeilColour?: string;
  annotationClickHandler?: AnnotationHandler;
  annotationDblClickHandler?: AnnotationHandler;
  annotationMouseOverHandler?: AnnotationHandler;
  annotationMouseOutHandler?: AnnotationHandler;
  width?: number | null;
  height?: number | null;
  title?: string | null;
  xlabel?: string | null;
  ylabel?: string | null;
  y2label?: string | null;
  labelsDiv?: HTMLElement | string | null;
  legend?: "never" | "onmouseover" | "always" | "follow" | null;
  legendFollowOffsetX?: number;
  legendFollowOffsetY?: number;
  showRoller?: boolean;
  rollPeriod?: number;
  dateWindow?: [number, number] | null;
  valueRange?: [number | null, number | null] | null;
  includeZero?: boolean;
  stackedGraph?: boolean;
  stackedGraphNaNFill?: "all" | "inside" | "none";
  /** DOM + canvas chrome theme. Sets `data-theme` on the chart root. */
  theme?: "light" | "dark";
  /**
   * Extra CSS classes on chart DOM nodes (concatenated after `zpgraph-*`).
   * Useful for Tailwind utilities. See `ChartClassNames`.
   */
  classNames?: ChartClassNames;
  errorBars?: boolean;
  fractions?: boolean;
  customBars?: boolean;
  wilsonInterval?: boolean;
  sigma?: number;
  fillGraph?: boolean;
  fillAlpha?: number;
  connectSeparatedPoints?: boolean;
  drawPoints?: boolean;
  drawGapEdgePoints?: boolean;
  hideOverlayOnMouseOut?: boolean;
  resizable?: "no" | "horizontal" | "vertical" | "both";
  animatedZooms?: boolean;
  animateBackgroundFade?: boolean;
  interactionModel?: InteractionModel | null;
  plugins?: Array<Plugin | (new () => Plugin)>;
  plotter?: Plotter | Plotter[];
  axes?: Partial<Record<AxisName, AxisOptions>>;
  series?: Record<string, PerSeriesOptions>;
  visibility?: boolean[];
  showRangeSelector?: boolean;
  rangeSelectorHeight?: number;
  pixelRatio?: number | null;
  underlayCallback?: (
    ctx: CanvasRenderingContext2D,
    area: { x: number; y: number; w: number; h: number },
    g: Zpgraph,
  ) => void;
  drawCallback?: (g: Zpgraph, isInitial: boolean) => void;
  dataLoadErrorCallback?: (error: unknown, url: string, g: Zpgraph) => void;
  highlightCallback?: (
    event: MouseEvent,
    x: number,
    points: Point[],
    row: number,
    seriesName: string,
  ) => void;
  unhighlightCallback?: (event: MouseEvent) => void;
  clickCallback?: (event: MouseEvent, x: number, points: Point[]) => void;
  pointClickCallback?: (event: MouseEvent, point: Point) => void;
  zoomCallback?: (
    minDate: number,
    maxDate: number,
    yRanges: [number, number][],
  ) => void;
  thresholds?: ThresholdBand[];
  toolbar?: boolean | ToolbarOptions;
  noData?: NoDataOptions | false;
  loading?: boolean;
  tooltip?: TooltipOptions;
  responsive?: ResponsiveRule[];
  fillGradient?: FillGradient;
  states?: ChartStates;
  forecast?: ForecastOptions;
  dataLabels?: DataLabelsOptions;
  markers?: MarkersOptions;
  chartAnnotations?: ChartAnnotations;
  eventMarkers?: EventMarker[];
  /** Alias of strokePattern when set globally. */
  strokeDashArray?: number[];
}

/** Breakpoint overrides merged on container resize (ApexCharts-style). */
export type ResponsiveRule = {
  breakpoint: number;
  options: Partial<ZpgraphOptions>;
};

/** Argument handed to `legendFormatter`. */
export interface LegendData {
  zpgraph: unknown;
  x?: number;
  xHTML?: string;
  i: number | null;
  series: Array<{
    label: string;
    labelHTML: string;
    /** Markup string for formatters that build HTML. Prefer `dashSegments_`. */
    dashHTML: string;
    /** Dash geometry for formatters that build DOM nodes. */
    dashSegments_?: Array<{ offset: number; length: number }>;
    color: string;
    isVisible: boolean;
    isHighlighted?: boolean;
    y?: number | null;
    yHTML?: string;
  }>;
}

export type ZpgraphElement = HTMLElement | string;

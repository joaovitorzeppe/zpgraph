/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Internal types shared by zpgraph core modules (layout, canvas, plugins,
 * interaction). Not part of the public consumer API.
 */

import type {
  Annotation,
  AxisName,
  InteractionContext,
  Plugin,
  Point,
  ZpgraphOptions,
} from "./types";

/** Option lookup used by tickers, formatters, and per-series helpers. */
export type OptionsGetter = (name: string, series?: string) => unknown;

/** Plot rectangle in canvas pixel coordinates. */
export interface PlotArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** X-axis normalization state built in `ZpgraphLayout.evaluate()`. */
export interface XAxisLayoutState {
  minval: number;
  maxval: number;
  scale: number;
  xlogrange?: number;
  xlogscale?: number;
}

/** Tick placement after layout evaluation (fraction of plot area). */
export interface LayoutTick {
  pos: number;
  label: string;
  has_tick: boolean;
}

export interface LayoutYTick extends LayoutTick {
  axis: number;
}

/** Annotation with parsed numeric x after `setAnnotations`. */
export type ParsedAnnotation = Annotation & { xval?: number | null };

/** Payload merged into the plugin `layout` cascade event. */
export interface LayoutEventPayload {
  chart_div: HTMLElement;
  reserveSpaceLeft: (px: number) => PlotArea;
  reserveSpaceRight: (px: number) => PlotArea;
  reserveSpaceTop: (px: number) => PlotArea;
  reserveSpaceBottom: (px: number) => PlotArea;
  chartRect: () => PlotArea;
}

/** Axis tick from a ticker before layout converts it to pixel fractions. */
export type AxisTick = { v: number; label: string; label_v?: number };

/**
 * Runtime y-axis object stored on `zpgraph.axes_[i]`.
 * Built in computeYAxes_ / computeYAxisRanges_ / layout._evaluateLimits.
 */
export interface AxisProperties {
  /** Back-reference to the chart (set as `{ g: this }` in computeYAxes_). */
  g?: ZpgraphInstance;
  minyval?: number;
  maxyval?: number;
  yrange?: number;
  /** 1 / yrange (linear scale factor). */
  yscale?: number;
  ylogrange?: number;
  ylogscale?: number;
  logscale?: boolean;
  valueRange?: [number | null, number | null] | null;
  extremeRange?: [number, number];
  computedValueRange?: [number, number];
  independentTicks?: boolean;
  ticks?: Array<{ v: number; label: string; label_v?: number }>;
  /** Per-axis options copied from OptionsManager.axisOptions. */
  [key: string]: unknown;
}

/**
 * Parsed chart input: each row is `[x, y1, y2, ...]`.
 * Cell values may be numbers, Dates, null, or nested arrays (error/custom bars).
 */
export type RawDataCell = number | number[] | Date | null;
export type RawDataRow = RawDataCell[];
export type RawData = RawDataRow[];

/**
 * Unified series sample from datahandlers:
 * `[x, y]` or `[x, y, extras]` (extras often `[yTop, yBottom]` for bars).
 */
export type SeriesExtras = unknown;
export type UnifiedSample =
  | [number, number | null]
  | [number, number | null, SeriesExtras];
export type UnifiedSeries = UnifiedSample[];

/** Minimal OptionsManager surface used by layout / interaction / datahandlers. */
export interface OptionsManagerLike {
  get(name: string): unknown;
  getForSeries(name: string, series: string): unknown;
  getForAxis(name: string, axis: AxisName | number | string): unknown;
  axisForSeries(series: string): number;
  numAxes(): number;
  seriesForAxis(axis: number): string[];
  axisOptions(axis: number): Record<string, unknown>;
}

/** Minimal layout surface plugins/canvas read. */
export interface LayoutLike {
  points: Point[][];
  setNames: string[];
  annotations: Annotation[];
  annotated_points?: Point[];
  xticks?: Array<{ pos: number; label: string; has_tick: boolean }>;
  yticks?: Array<{
    axis: number;
    pos: number;
    label: string;
    has_tick: boolean;
  }>;
  getPlotArea(): PlotArea;
}

/** Minimal canvas plotter surface interaction/plugins touch. */
export interface PlotterLike {
  area: PlotArea;
  colors: Record<string, string>;
  clear(): void;
  render(): void;
  _renderLineChart(
    highlightSeries?: string | null,
    ctx?: CanvasRenderingContext2D,
  ): void;
}

/** Minimal datahandler surface used during draw. */
export interface DataHandlerLike {
  extractSeries(
    rawData: RawData,
    seriesIndex: number,
    options: OptionsManagerLike,
  ): UnifiedSeries;
  rollingAverage(
    series: UnifiedSeries,
    rollPeriod: number,
    options: OptionsManagerLike,
    seriesIndex?: number,
  ): UnifiedSeries;
  seriesToPoints(
    series: UnifiedSeries,
    setName: string,
    boundaryIdStart: number,
  ): Point[];
  getExtremeYValues(
    series: UnifiedSeries,
    dateWindow?: [number, number] | null,
    stepPlot?: boolean,
  ): [number | null, number | null];
  onLineEvaluated(
    points: Point[],
    axis: AxisProperties,
    logscale: boolean,
  ): void;
}

/**
 * Chart instance surface for plugins, layout, canvas, and interaction.
 * Matches constructor-function style fields (trailing `_`) plus public methods.
 */
export interface ZpgraphInstance {
  // --- fields accessed across modules ---
  width_: number;
  height_: number;
  maindiv_: HTMLElement;
  graphDiv: HTMLElement;
  file_: unknown;
  rollPeriod_: number;
  dateWindow_: [number, number] | null;
  annotations_: Annotation[];
  attrs_: ZpgraphOptions;
  user_attrs_: ZpgraphOptions;
  attributes_: OptionsManagerLike;
  layout_: LayoutLike;
  plotter_: PlotterLike;
  axes_: AxisProperties[];
  rawData_: RawData | null;
  dataHandler_: DataHandlerLike;
  canvas_: HTMLCanvasElement;
  hidden_: HTMLCanvasElement;
  canvas_ctx_: CanvasRenderingContext2D;
  hidden_ctx_: CanvasRenderingContext2D;
  colors_: string[];
  colorsMap_: Record<string, string>;
  selPoints_: Point[];
  lastx_: number | null;
  lastRow_: number;
  highlightSet_: string | null;
  lockedSet_?: boolean | string | null;
  is_initial_draw_: boolean;
  boundaryIds_: Array<[number, number] | null>;
  setIndexByName_: Record<string, number>;
  plugins_: unknown[];

  // --- option accessors ---
  getOption: OptionsGetter;
  getNumericOption(name: string, series?: string): number;
  getStringOption(name: string, series?: string): string;
  getBooleanOption(name: string, series?: string): boolean;
  getFunctionOption(
    name: string,
    series?: string,
  ): (...args: unknown[]) => unknown;
  getOptionForAxis(name: string, axis: AxisName | string | number): unknown;
  attr_(name: string, seriesName?: string): unknown;

  // --- events / interaction ---
  cascadeEvents_(name: string, extra_props?: Record<string, unknown>): boolean;
  addAndTrackEvent(elem: EventTarget, type: string, fn: EventListener): void;

  // --- ranges / coords ---
  xAxisRange(): [number, number];
  xAxisExtremes(): [number, number];
  yAxisRange(idx?: number): [number, number] | null;
  yAxisRanges(): Array<[number, number] | null>;
  yAxisExtremes(): Array<[number, number]>;
  toDomCoords(x: number, y: number, axis?: number): [number, number];
  toDomXCoord(x: number | null | undefined): number | null;
  toDomYCoord(y: number | null | undefined, axis?: number): number | null;
  toDataCoords(x: number, y: number, axis?: number): [number, number];
  toDataXCoord(x: number | null | undefined): number | null;
  toDataYCoord(y: number | null | undefined, axis?: number): number | null;
  toPercentXCoord(x: number | null | undefined): number | null;
  toPercentYCoord(y: number | null | undefined, axis?: number): number | null;
  getArea(): PlotArea;
  eventToDomCoords(event: MouseEvent): [number, number];

  // --- data / series ---
  numRows(): number;
  numColumns(): number;
  numAxes(): number;
  getValue(row: number, col: number): unknown;
  getLabels(): string[] | null;
  getColors(): string[];
  getPropertiesForSeries(seriesName: string): {
    name: string;
    column: number;
    visible: boolean;
    color: string;
    axis: number;
  } | null;
  axisPropertiesForSeries(series: string): AxisProperties;
  visibility(): boolean[];
  indexFromSetName(name: string): number | undefined;
  getRowForX(xVal: number): number | null;

  // --- selection / highlight ---
  setSelection(
    row: number | number[],
    opt_seriesName?: string | null,
    opt_locked?: boolean,
    opt_trigger_highlight_callback?: boolean,
  ): boolean | void;
  getSelection(): number;
  clearSelection(): void;
  getHighlightSeries(): string | null | undefined;
  isSeriesLocked(): boolean;
  findClosestRow(domX: number): number;
  findClosestPoint(
    domX: number,
    domY: number,
  ): { row: number; seriesName: string; point: Point; dist: number };
  findStackedPoint(
    domX: number,
    domY: number,
  ): { row: number; seriesName: string; point: Point };

  // --- zoom / draw (interaction + plugins) ---
  isZoomed(axis?: "x" | "y" | null): boolean;
  resetZoom(): void;
  doZoomX_(lowX: number, highX: number): void;
  doZoomXDates_(minDate: number, maxDate: number): void;
  doZoomY_(lowY: number, highY: number): void;
  drawZoomRect_(
    direction: number,
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    prevDirection?: number,
    prevEndX?: number,
    prevEndY?: number,
  ): void;
  clearZoomRect_(): void;
  drawGraph_(force?: boolean): void;

  // --- public lifecycle ---
  updateOptions(attrs: Partial<ZpgraphOptions>, block_redraw?: boolean): void;
  resize(width?: number, height?: number): void;
  adjustRoll(length: number): void;
  setVisibility(num: number | number[] | object, value?: boolean): void;
  size(): [number, number];
  setAnnotations(ann: Annotation[], suppressDraw?: boolean): void;
  annotations(): Annotation[];
  ready(callback: (g: ZpgraphInstance) => void): void;
  destroy(): void;
  rollPeriod(): number;
  toString(): string;

  /** Interaction models may stash context via initializeMouseDown. */
  [key: string]: unknown;
}

/** Convenience alias for interaction callbacks that receive the chart. */
export type ChartInteractionHandler = (
  event: Event,
  g: ZpgraphInstance,
  context: InteractionContext,
) => void;

/** Base payload merged into every plugin cascade event. */
export interface PluginEventBase {
  zpgraph: ZpgraphInstance;
  cancelable: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
  propagationStopped: boolean;
  stopPropagation(): void;
}

/** Layout phase: plugins reserve margin around the plot area. */
export interface LayoutPluginEvent extends PluginEventBase {
  chart_div: HTMLElement;
  reserveSpaceLeft: (px: number) => PlotArea;
  reserveSpaceRight: (px: number) => PlotArea;
  reserveSpaceTop: (px: number) => PlotArea;
  reserveSpaceBottom: (px: number) => PlotArea;
  chartRect: () => PlotArea;
}

/** predraw / willDrawChart / didDrawChart / clearChart plugin payloads. */
export interface ChartDrawPluginEvent extends PluginEventBase {
  canvas: HTMLCanvasElement;
  drawingContext: CanvasRenderingContext2D;
}

/** Selection highlight plugin payload. */
export interface SelectPluginEvent extends PluginEventBase {
  selectedRow?: number;
  selectedX?: number;
  selectedPoints?: Point[];
}

/** Runtime plugin registration stored on `zpgraph.plugins_`. */
export interface PluginRegistration {
  plugin: Plugin;
  events: Record<string, (...args: unknown[]) => unknown>;
  options: Record<string, unknown>;
  pluginOptions: Record<string, unknown>;
}

/** Point carrying a parsed annotation from layout. */
export type AnnotatedPoint = Point & { annotation: Annotation };

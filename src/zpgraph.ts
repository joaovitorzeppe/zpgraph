"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*
  Usage:
   <div id="graphdiv" style="width:800px; height:500px;"></div>
   <script type="module">
     new Zpgraph(document.getElementById("graphdiv"),
                 "datafile.csv",  // CSV file with headers
                 { }); // options
   </script>

 The CSV file is of the form

   Date,SeriesA,SeriesB,SeriesC
   YYYY-MM-DD,A1,B1,C1
   YYYY-MM-DD,A2,B2,C2

 If the 'errorBars' option is set in the constructor, the input should be of
 the form
   Date,SeriesA,SeriesB,...
   YYYY-MM-DD,A1,sigmaA1,B1,sigmaB1,...
   YYYY-MM-DD,A2,sigmaA2,B2,sigmaB2,...

 If the 'fractions' option is set, the input should be of the form:

   Date,SeriesA,SeriesB,...
   YYYY-MM-DD,A1/B1,A2/B2,...
   YYYY-MM-DD,A1/B1,A2/B2,...

 And high/low bands will be calculated automatically using a binomial distribution.

 For further documentation and examples, see https://github.com/joaovitorzeppe/zpgraph/
 */

import ZpgraphLayout from "./layout";
import { log } from "./logger";
import {
  toCsv,
  toPng,
  type ToCsvOptions,
  type ToPngOptions,
} from "./export-chart";
import { applyResponsiveOptions } from "./responsive";
import type {
  Annotation,
  AxisName,
  Data,
  InteractionModel,
  Plugin,
  Point,
  Ticker,
  ZpgraphElement,
  ZpgraphOptions,
} from "./types";
import type {
  AxisProperties,
  DataHandlerLike,
  OptionsGetter,
  RawData,
  UnifiedSeries,
} from "./internal-types";
import ZpgraphCanvasRenderer from "./canvas";
import OptionsManager from "./options";
import * as utils from "./utils";
import OPTIONS_REFERENCE_ from "./options-reference";
import DEFAULT_ATTRS from "./default-attrs";
import * as ZpgraphTickers from "./tickers";
import {
  eventToDomCoords,
  toDataCoords,
  toDataXCoord,
  toDataYCoord,
  toDomCoords,
  toDomXCoord,
  toDomYCoord,
  toPercentXCoord,
  toPercentYCoord,
  xAxisExtremes,
  xAxisRange,
  yAxisRange,
  yAxisRanges,
} from "./coords";
import { resizeElements } from "./dom";
import {
  clearSelection,
  findClosestPoint,
  findClosestRow,
  findStackedPoint,
  getSelection,
  mouseMove,
  mouseOut,
  setSelection,
  updateSelection,
} from "./selection";
import {
  clearZoomRect,
  doAnimatedZoom,
  doZoomX,
  doZoomXDates,
  doZoomY,
  drawZoomRect,
  resetZoom,
} from "./zoom";
import { drawGraph, predraw, yAxisExtremes } from "./render";
import {
  addXTicks_,
  cascadeEvents_ as cascadeEventsFn_,
  addPlugins as addPlugins_,
  destroy,
  getHandlerClass_,
  init as init_,
  loadedEvent_,
  removeTrackedEvents_,
  setColors_,
  setVisibility,
  start as start_,
  updateOptions as updateOptionsFn_,
  visibility,
} from "./lifecycle";
import { registerZpgraphStatics } from "./register";

const OPTIONS_REFERENCE: Record<string, unknown> | null = OPTIONS_REFERENCE_;

const isAxisName = (a: string): a is AxisName =>
  a === "x" || a === "y" || a === "y2";

interface PluginDict {
  plugin: Plugin;
  events: Record<string, (...args: unknown[]) => unknown>;
  options: Record<string, unknown>;
  pluginOptions: Record<string, unknown>;
}

type TrackedEvent = {
  elem: EventTarget;
  type: string;
  fn: utils.DomEventHandler;
};

/**
 * @class Creates an interactive, zoomable chart.
 * @name Zpgraph
 *
 * @constructor
 * @param div A div or the id of a div into which to construct
 * the chart. Must not have any padding.
 * @param file A file containing CSV data or a function
 * that returns this data. The most basic expected format for each line is:
 * "YYYY/MM/DD,val1,val2,..."
 *
 * @param attrs Various other attributes, e.g. errorBars determines
 * whether the input data contains error ranges.
 */

export default class Zpgraph {
  // Lets lifecycle read statics via g.constructor without an unsafe cast.
  declare ["constructor"]: typeof Zpgraph;

  is_initial_draw_!: boolean;
  readyFns_!: Array<(g: Zpgraph) => void>;
  maindiv_!: HTMLElement;
  file_!: Data | string | (() => Data);
  rollPeriod_!: number;
  previousVerticalX_!: number;
  fractions_!: boolean;
  dateWindow_!: [number, number] | null;
  annotations_!: Annotation[];
  width_!: number;
  height_!: number;
  user_attrs_!: ZpgraphOptions;
  attrs_!: ZpgraphOptions;
  boundaryIds_!: Array<[number, number]>;
  setIndexByName_!: Record<string, number>;
  datasetIndex_!: number[];
  registeredEvents_!: TrackedEvent[];
  eventListeners_!: Record<
    string,
    Array<[Plugin, (...args: unknown[]) => unknown]>
  >;
  attributes_!: OptionsManager;
  plugins_!: PluginDict[];
  graphDiv!: HTMLDivElement;
  canvas_!: HTMLCanvasElement;
  hidden_!: HTMLCanvasElement;
  plotter_!: ZpgraphCanvasRenderer;
  mouseMoveHandler_?: utils.Coalesced<[Event]>;
  keyDownHandler_?: utils.DomEventHandler;
  /** Row the keyboard last moved to, undefined before the first key. */
  keyboardRow_: number | undefined;
  /** Frame-coalesced handlers, cancelled on destroy. */
  coalesced_: Array<{ flush(): void; cancel(): void }> = [];
  /** Zoom and selection animations, cancelled on destroy. */
  animationStops_: Array<() => void> = [];
  destroyed_ = false;
  mouseOutHandler_?: utils.DomEventHandler;
  resizeHandler_?: utils.Coalesced<[]> | null;
  resizeObserver_?: ResizeObserver | null;
  fileLoadAbort_: AbortController | null = null;
  rawData_!: RawData;
  layout_!: ZpgraphLayout;
  colors_!: string[];
  colorsMap_!: Record<string, string>;
  axes_!: AxisProperties[];
  selPoints_!: Point[];
  highlightSet_!: string | null;
  lockedSet_!: boolean;
  lastx_!: number | null;
  lastRow_!: number;
  fadeLevel!: number;
  animateId!: number;
  roller_: HTMLInputElement | null | undefined;
  rolledSeries_!: Array<UnifiedSeries | null>;
  drawingTimeMs_!: number;
  readyFired_!: boolean;
  resize_lock!: boolean;
  currentZoomRectArgs_: unknown;
  canvas_ctx_!: CanvasRenderingContext2D;
  hidden_ctx_!: CanvasRenderingContext2D;
  mouseEventElement_!: HTMLElement;
  dataHandler_!: DataHandlerLike;

  static NAME: string;
  static VERSION: string;
  static DEFAULT_ROLL_PERIOD: number;
  static DEFAULT_WIDTH: number;
  static DEFAULT_HEIGHT: number;
  static Plotters: typeof ZpgraphCanvasRenderer._Plotters;
  static addedAnnotationCSS: boolean;
  static PLUGINS: Array<(new () => Plugin) | Plugin>;
  static DOTTED_LINE: number[];
  static DASHED_LINE: number[];
  static DOT_DASH_LINE: number[];
  static dateAxisLabelFormatter: typeof utils.dateAxisLabelFormatter;
  static findPos: typeof utils.findPos;
  static pageX: typeof utils.pageX;
  static pageY: typeof utils.pageY;
  static defaultInteractionModel: InteractionModel;
  static nonInteractiveModel: InteractionModel;
  static Circles: typeof utils.Circles;
  // `never[]` = constructible with zero args; extras may take optional opts.
  static Plugins: Record<string, new (...args: never[]) => Plugin>;
  static DataHandlers: Record<
    string,
    new (...args: never[]) => DataHandlerLike
  >;
  static numericLinearTicks: Ticker;
  static numericTicks: Ticker;
  static integerTicks: Ticker;
  static dateTicker: Ticker;
  static Granularity: Record<string, number>;
  static pickDateTickGranularity: typeof ZpgraphTickers.pickDateTickGranularity;
  static getDateAxis: typeof ZpgraphTickers.getDateAxis;
  static floatFormat: typeof utils.floatFormat;
  static DEFAULT_ATTRS: typeof DEFAULT_ATTRS;
  static FORCE_FAST_PROXY: boolean;

  /**
   * @param div A div or the id of a div into which to construct
   * the chart. Must not have any padding.
   * @param file A file containing CSV data or a function
   * that returns this data.
   * @param attrs Various other attributes, e.g. errorBars determines
   * whether the input data contains error ranges.
   */
  constructor(div: ZpgraphElement, data: Data, opts?: Partial<ZpgraphOptions>) {
    this.__init__(div, data, opts);
  }

  /**
   * Initializes the Zpgraph. This creates a new DIV and constructs the hidden
   * and context &lt;canvas&gt; inside of it. See the constructor for details.
   * on the parameters.
   * @param div the Element to render the graph into.
   * @param file Source data
   * @param attrs Miscellaneous other options
   * @private
   */
  __init__(div: ZpgraphElement, file: Data, attrs?: Partial<ZpgraphOptions>) {
    init_(this, div, file, attrs);
  }

  /**
   * Triggers a cascade of events to the various plugins which are interested in them.
   * Returns true if the "default behavior" should be prevented, i.e. if one
   * of the event listeners called event.preventDefault().
   * @private
   */
  cascadeEvents_(name: string, extra_props?: Record<string, unknown>) {
    return cascadeEventsFn_(this, name, extra_props);
  }

  /**
   * Fetch a plugin instance of a particular class. Only for testing.
   * @private
   * @param type The type of the plugin.
   * @return Instance of the plugin, or null if there is none.
   */
  getPluginInstance_<T extends Plugin>(type: new () => T): T | null {
    for (let i = 0; i < this.plugins_.length; i++) {
      const p = this.plugins_[i]!;
      if (p.plugin instanceof type) {
        return p.plugin;
      }
    }
    return null;
  }

  /**
   * Returns the zoomed status of the chart for one or both axes.
   *
   * Axis is an optional parameter. Can be set to 'x' or 'y'.
   *
   * The zoomed status for an axis is set whenever a user zooms using the mouse
   * or when the dateWindow or valueRange are updated. Double-clicking or calling
   * resetZoom() resets the zoom status for the chart.
   */
  isZoomed(axis?: "x" | "y" | null) {
    const isZoomedX = !!this.dateWindow_;
    if (axis === "x") {
      return isZoomedX;
    }

    const isZoomedY = this.axes_.some((ax) => !!ax.valueRange);
    if (axis === null || axis === undefined) {
      return isZoomedX || isZoomedY;
    }
    if (axis === "y") {
      return isZoomedY;
    }

    throw new Error(`axis parameter is [${String(axis)}] must be null, 'x' or 'y'.`);
  }

  /**
   * Returns information about the Zpgraph object, including its containing ID.
   */
  toString() {
    const maindiv = this.maindiv_;
    const id = maindiv?.id ? maindiv.id : "";
    return "[Zpgraph " + id + "]";
  }

  /**
   * @private
   * Returns the value of an option. This may be set by the user (either in the
   * constructor or by calling updateOptions) or by zpgraph, and may be set to a
   * per-series value.
   * @param name The name of the option, e.g. 'rollPeriod'.
   * @param [seriesName] The name of the series to which the option
   * will be applied. If no per-series value of this option is available, then
   * the global value is returned. This is optional.
   * @return The value of the option.
   */
  attr_(name: string, seriesName?: string) {
    // OPTIONS_REFERENCE is tree-shaken out of production bundles.
    if (OPTIONS_REFERENCE && !Object.hasOwn(OPTIONS_REFERENCE, name)) {
      log.error(
        "Zpgraph is using property " +
          name +
          ", which has no " +
          "entry in the Zpgraph.OPTIONS_REFERENCE listing.",
      );
      // Only log this error once.
      OPTIONS_REFERENCE[name] = true;
    }
    return seriesName
      ? this.attributes_.getForSeries(name, seriesName)
      : this.attributes_.get(name);
  }

  /**
   * Returns the current value for an option, as set in the constructor or via
   * updateOptions. You may pass in an (optional) series name to get per-series
   * values for the option.
   *
   * All values returned by this method should be considered immutable. If you
   * modify them, there is no guarantee that the changes will be honored or that
   * zpgraph will remain in a consistent state. If you want to modify an option,
   * use updateOptions() instead.
   *
   * @param name The name of the option (e.g. 'strokeWidth')
   * @param opt_seriesName Series name to get per-series values.
   * @return The value of the option.
   */
  getOption(name: keyof ZpgraphOptions | (string & {}), opt_seriesName?: string): unknown {
    return this.attr_(name, opt_seriesName);
  }

  /**
   * Like getOption(), but specifically returns a number.
   * This is a convenience function for working with the Closure Compiler.
   * @param name The name of the option (e.g. 'strokeWidth')
   * @param opt_seriesName Series name to get per-series values.
   * @return The value of the option.
   * @private
   */
  getNumericOption(name: string, opt_seriesName?: string): number {
    const v = this.getOption(name, opt_seriesName);
    return typeof v === "number" ? v : Number(v);
  }

  /**
   * Like getOption(), but specifically returns a string.
   * This is a convenience function for working with the Closure Compiler.
   * @param name The name of the option (e.g. 'strokeWidth')
   * @param opt_seriesName Series name to get per-series values.
   * @return The value of the option.
   * @private
   */
  getStringOption(name: string, opt_seriesName?: string): string {
    const v = this.getOption(name, opt_seriesName);
    if (typeof v === "string") {
      return v;
    }
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
      return String(v);
    }
    return "";
  }

  /**
   * Like getOption(), but specifically returns a boolean.
   * This is a convenience function for working with the Closure Compiler.
   * @param name The name of the option (e.g. 'strokeWidth')
   * @param opt_seriesName Series name to get per-series values.
   * @return The value of the option.
   * @private
   */
  getBooleanOption(name: string, opt_seriesName?: string): boolean {
    const v = this.getOption(name, opt_seriesName);
    return typeof v === "boolean" ? v : Boolean(v);
  }

  /**
   * Like getOption(), but specifically returns a function.
   * This is a convenience function for working with the Closure Compiler.
   * @param name The name of the option (e.g. 'strokeWidth')
   * @param opt_seriesName Series name to get per-series values.
   * @return The value of the option.
   * @private
   */
  getFunctionOption(
    name: string,
    opt_seriesName?: string,
  ): ((...args: unknown[]) => unknown) | undefined {
    const v = this.getOption(name, opt_seriesName);
    if (typeof v !== "function") {
      return undefined;
    }
    return (...args: unknown[]) => v(...args);
  }

  getOptionForAxis(name: string, axis: string | number) {
    return this.attributes_.getForAxis(name, axis);
  }

  /**
   * @private
   * @param axis The name of the axis (i.e. 'x', 'y' or 'y2')
   * @return A function mapping string -> option value
   */
  optionsViewForAxis_(axis: string): OptionsGetter {
    const normalized =
      axis === "y1" || axis === "Y1" || axis === "Y" || axis === "y"
        ? "y"
        : axis === "Y2" || axis === "y2"
          ? "y2"
          : axis === "x" || axis === "X"
            ? "x"
            : axis;
    if (!isAxisName(normalized)) {
      throw new Error("Unknown axis: " + axis);
    }
    const axisName = normalized;
    const readAxisOpt = (
      axes: ZpgraphOptions["axes"],
      opt: string,
    ): unknown => {
      if (!axes) {
        return undefined;
      }
      const bucket: unknown = Reflect.get(axes, axisName);
      if (
        typeof bucket === "object" &&
        bucket !== null &&
        Object.hasOwn(bucket, opt)
      ) {
        return Reflect.get(bucket, opt);
      }
      return undefined;
    };
    const userAttrs = this.user_attrs_;

    return (opt: string) => {
      const userAxisOpt = readAxisOpt(this.user_attrs_.axes, opt);
      if (userAxisOpt !== undefined) {
        return userAxisOpt;
      }

      // I don't like that this is in a second spot.
      if (axisName === "x" && opt === "logscale") {
        // return the default value.
        return false;
      }

      // user-specified attributes always trump defaults, even if they're less
      // specific.
      if (Object.hasOwn(userAttrs, opt)) {
        return Reflect.get(userAttrs, opt);
      }

      const attrsAxisOpt = readAxisOpt(this.attrs_.axes, opt);
      if (attrsAxisOpt !== undefined) {
        return attrsAxisOpt;
      }

      // check old-style axis options
      if (axisName === "y") {
        const y0 = this.axes_?.[0];
        if (y0 && Object.hasOwn(y0, opt)) {
          return Reflect.get(y0, opt);
        }
      } else if (axisName === "y2") {
        const y1 = this.axes_?.[1];
        if (y1 && Object.hasOwn(y1, opt)) {
          return Reflect.get(y1, opt);
        }
      }
      return this.attr_(opt);
    };
  }

  /**
   * Returns the current rolling period, as set by the user or an option.
   * @return The number of points in the rolling window
   */
  rollPeriod() {
    return this.rollPeriod_;
  }

  /**
   * Ranges and coordinate conversions. The bodies live in coords.ts.
   */
  xAxisRange(): [number, number] {
    return xAxisRange(this);
  }

  xAxisExtremes(): [number, number] {
    return xAxisExtremes(this);
  }

  yAxisExtremes() {
    return yAxisExtremes(this);
  }

  yAxisRange(idx?: number) {
    return yAxisRange(this, idx);
  }

  yAxisRanges() {
    return yAxisRanges(this);
  }

  toDomCoords(x: number, y: number, axis?: number): [number | null, number | null] {
    return toDomCoords(this, x, y, axis);
  }

  toDomXCoord(x: number | null | undefined) {
    return toDomXCoord(this, x ?? null);
  }

  toDomYCoord(y: number | null | undefined, axis?: number) {
    return toDomYCoord(this, y ?? null, axis);
  }

  toDataCoords(x: number, y: number, axis?: number): [number | null, number | null] {
    return toDataCoords(this, x, y, axis);
  }

  toDataXCoord(x: number | null | undefined) {
    return toDataXCoord(this, x ?? null);
  }

  toDataYCoord(y: number | null | undefined, axis?: number) {
    return toDataYCoord(this, y ?? null, axis);
  }

  toPercentYCoord(y: number | null | undefined, axis?: number) {
    return toPercentYCoord(this, y ?? null, axis);
  }

  toPercentXCoord(x: number | null | undefined) {
    return toPercentXCoord(this, x ?? null);
  }

  eventToDomCoords(event: MouseEvent): [number, number] {
    return eventToDomCoords(this, event);
  }

  /**
   * Returns the number of columns (including the independent variable).
   * @return The number of columns.
   */
  numColumns() {
    if (!this.rawData_) {
      return 0;
    }
    if (this.rawData_[0]) {
      return this.rawData_[0].length;
    }
    const labels = this.attr_("labels");
    return Array.isArray(labels) ? labels.length : 0;
  }

  /**
   * Returns the number of rows (excluding any header/label row).
   * @return The number of rows, less any header.
   */
  numRows() {
    if (!this.rawData_) {
      return 0;
    }
    return this.rawData_.length;
  }

  /**
   * Returns the value in the given row and column. If the row and column exceed
   * the bounds on the data, returns null. Also returns null if the value is
   * missing.
   * @param row The row number of the data (0-based). Row 0 is the
   *     first row of data, not a header row.
   * @param col The column number of the data (0-based)
   * @return The value in the specified cell or null if the row/col
   *     were out of range.
   */
  getValue(row: number, col: number) {
    if (row < 0 || row >= this.rawData_.length) {
      return null;
    }
    const dataRow = this.rawData_[row]!;
    if (col < 0 || col >= dataRow.length) {
      return null;
    }

    return dataRow[col];
  }

  /**
   * Detach DOM elements in the zpgraph and null out all data references.
   * Calling this when you're done with a zpgraph can dramatically reduce memory
   * usage. See, e.g., the tests/perf.html example.
   */
  destroy() {
    destroy(this);
  }

  /** Activate extra plugins after construction. */
  addPlugins(extra: unknown[]) {
    addPlugins_(this, extra);
  }

  /**
   * Generate a set of distinct colors for the data series. This is done with a
   * color wheel. Saturation/Value are customizable, and the hue is
   * equally-spaced around the color wheel. If a custom set of colors is
   * specified, that is used instead.
   * @private
   */
  setColors_() {
    setColors_(this);
  }

  /**
   * Return the list of colors. This is either the list of colors passed in the
   * attributes or the autogenerated list of rgb(r,g,b) strings.
   * This does not return colors for invisible series.
   * @return The list of colors.
   */
  getColors() {
    return this.colors_;
  }

  /**
   * Returns a few attributes of a series, i.e. its color, its visibility, which
   * axis it's assigned to, and its column in the original data.
   * Returns null if the series does not exist.
   * Otherwise, returns an object with column, visibility, color and axis properties.
   * The "axis" property will be set to 1 for y1 and 2 for y2.
   * The "column" property can be fed back into getValue(row, column) to get
   * values for this series.
   */
  getPropertiesForSeries(series_name: string) {
    let idx = -1;
    const labels = this.getLabels();
    if (!labels) {
      return null;
    }
    for (let i = 1; i < labels.length; i++) {
      if (labels[i] === series_name) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      return null;
    }

    return {
      name: series_name,
      column: idx,
      visible: this.visibility()[idx - 1] ?? false,
      color: this.colorsMap_[series_name] ?? "",
      axis: 1 + this.attributes_.axisForSeries(series_name),
    };
  }

  /**
   * Zoom. The bodies live in zoom.ts; these are the names the interaction
   * model, the range selector and users call.
   */
  drawZoomRect_(
    direction: number,
    startX: number,
    endX: number,
    startY: number,
    endY: number,
    prevDirection?: number,
    prevEndX?: number,
    prevEndY?: number,
  ) {
    drawZoomRect(
      this,
      direction,
      startX,
      endX,
      startY,
      endY,
      prevDirection,
      prevEndX,
      prevEndY,
    );
  }

  clearZoomRect_() {
    clearZoomRect(this);
  }

  doZoomX_(lowX: number, highX: number) {
    doZoomX(this, lowX, highX);
  }

  doZoomXDates_(minDate: number, maxDate: number) {
    doZoomXDates(this, minDate, maxDate);
  }

  doZoomY_(lowY: number, highY: number) {
    doZoomY(this, lowY, highY);
  }

  /** Reset the zoom to the original view, animating there if asked to. */
  resetZoom() {
    resetZoom(this);
  }

  /** PNG data URL of the main chart canvas. */
  toPng(opts?: ToPngOptions) {
    return toPng(this, opts);
  }

  /** CSV dump of the current raw data. */
  toCsv(opts?: ToCsvOptions) {
    return toCsv(this, opts);
  }

  doAnimatedZoom(
    oldXRange: [number, number] | null,
    newXRange: [number, number] | null,
    oldYRanges: Array<[number, number]> | null,
    newYRanges: Array<[number, number]> | null,
    callback: () => void,
  ) {
    doAnimatedZoom(
      this,
      oldXRange,
      newXRange,
      oldYRanges,
      newYRanges,
      callback,
    );
  }

  /**
   * Get the current graph's area object.
   *
   * Returns: {x, y, w, h}
   */
  getArea() {
    return this.plotter_.area;
  }

  /**
   * Selection. The bodies live in selection.ts; these are the names users,
   * plugins and the event handlers call.
   */
  findClosestRow(domX: number) {
    return findClosestRow(this, domX);
  }

  findClosestPoint(domX: number, domY?: number) {
    return findClosestPoint(this, domX, domY);
  }

  findStackedPoint(domX: number, domY: number) {
    return findStackedPoint(this, domX, domY);
  }

  mouseMove_(event: MouseEvent) {
    mouseMove(this, event);
  }

  mouseOut_(event: MouseEvent) {
    mouseOut(this, event);
  }

  updateSelection_(opt_animFraction?: number) {
    updateSelection(this, opt_animFraction);
  }

  /**
   * Manually set the selected points and display information about them in the
   * legend. The selection can be cleared using clearSelection() and queried
   * using getSelection().
   */
  setSelection(
    row: number | number[],
    opt_seriesName?: string | null,
    opt_locked?: boolean,
    opt_trigger_highlight_callback?: boolean,
  ) {
    return setSelection(
      this,
      row,
      opt_seriesName,
      opt_locked,
      opt_trigger_highlight_callback,
    );
  }

  /** Clears the current selection (i.e. points that were highlighted). */
  clearSelection() {
    clearSelection(this);
  }

  /**
   * Returns the number of the currently selected row. To get data for this row,
   * you can use the getValue method.
   * Returns: row number, or -1 if nothing is selected
   */
  getSelection() {
    return getSelection(this);
  }

  /**
   * Returns the name of the currently-highlighted series.
   * Only available when the highlightSeriesOpts option is in use.
   */
  getHighlightSeries() {
    return this.highlightSet_;
  }

  /**
   * Returns true if the currently-highlighted series was locked
   * via setSelection(..., seriesName, true).
   */
  isSeriesLocked() {
    return this.lockedSet_;
  }

  /**
   * Fires when there's data available to be graphed.
   * @param data Raw CSV data to be plotted
   * @private
   */
  loadedEvent_(data: string) {
    loadedEvent_(this, data);
  }

  /** @private */
  addXTicks_() {
    addXTicks_(this);
  }

  /** @private */
  getHandlerClass_() {
    return getHandlerClass_(this);
  }

  /**
   * Redraws the chart for the current viewport. See render.ts.
   * @private
   */
  drawGraph_() {
    drawGraph(this);
  }

  /**
   * Returns the number of y-axes on the chart.
   * @return the number of axes.
   */
  numAxes() {
    return this.attributes_.numAxes();
  }

  /**
   * @private
   * Returns axis properties for the given series.
   * @param setName The name of the series for which to get axis
   * properties, e.g. 'Y1'.
   * @return The axis properties.
   */
  axisPropertiesForSeries(series: string): AxisProperties {
    return this.axes_[this.attributes_.axisForSeries(series)]!;
  }

  /**
   * Signals to plugins that the chart data has updated.
   * This happens after the data has updated but before the chart has redrawn.
   * @private
   */
  cascadeDataDidUpdateEvent_() {
    // Do not call xAxisRange()/toDomCoords from handlers of this event.
    // The visible range should be set when the chart is drawn, not derived from the data.
    this.cascadeEvents_("dataDidUpdate", {});
  }

  /**
   * Get the CSV data. If it's in a function, call that function. If it's in a
   * file, fetch it.
   * @private
   */
  start_() {
    start_(this);
  }

  /**
   * Changes various properties of the graph. These can include:
   * <ul>
   * <li>file: changes the source data for the graph</li>
   * <li>errorBars: changes whether the data contains stddev</li>
   * </ul>
   *
   * There's a huge variety of options that can be passed to this method. For a
   * full list, see the options reference in the README.
   *
   * @param input_attrs The new properties and values
   * @param block_redraw Usually the chart is redrawn after every
   *     call to updateOptions(). If you know better, you can pass true to
   *     explicitly block the redraw. This can be useful for chaining
   *     updateOptions() calls, avoiding the occasional infinite loop and
   *     preventing redraws when it's not necessary (e.g. when updating a
   *     callback).
   */
  updateOptions(input_attrs: Partial<ZpgraphOptions>, block_redraw?: boolean) {
    updateOptionsFn_(this, input_attrs, block_redraw);
  }

  /**
   * Make a copy of input attributes, removing file as a convenience.
   * @private
   */
  static copyUserAttrs_(attrs: Partial<ZpgraphOptions>) {
    const my_attrs: Partial<ZpgraphOptions> = {};
    for (const k of Object.keys(attrs)) {
      if (k === "file") {
        continue;
      }
      Reflect.set(my_attrs, k, Reflect.get(attrs, k));
    }
    return my_attrs;
  }

  /**
   * Resizes the zpgraph. If no parameters are specified, resizes to fill the
   * containing div (which has presumably changed size since the zpgraph was
   * instantiated). If the width/height are specified, the div will be resized.
   *
   * This is far more efficient than destroying and re-instantiating a
   * Zpgraph, since it doesn't have to reparse the underlying data.
   *
   * @param width Width (in pixels)
   * @param height Height (in pixels)
   */
  resize(width?: number | null, height?: number | null) {
    if (this.resize_lock) {
      return;
    }
    this.resize_lock = true;

    if ((width === null) !== (height === null)) {
      log.warn(
        "Zpgraph.resize() should be called with zero parameters or " +
          "two non-NULL parameters. Pretending it was zero.",
      );
      width = height = null;
    }

    const old_width = this.width_;
    const old_height = this.height_;

    if (width != null && height != null) {
      this.maindiv_.style.width = width + "px";
      this.maindiv_.style.height = height + "px";
      this.width_ = width;
      this.height_ = height;
    } else {
      this.width_ = this.maindiv_.clientWidth;
      this.height_ = this.maindiv_.clientHeight;
    }

    if (old_width !== this.width_ || old_height !== this.height_) {
      // Resizing a canvas erases it, even when the size doesn't change, so
      // any resize needs to be followed by a redraw.
      resizeElements(this);
      predraw(this);
      applyResponsiveOptions(this);
    }

    this.resize_lock = false;
  }

  /**
   * Adjusts the number of points in the rolling average. Updates the graph to
   * reflect the new averaging period.
   * @param length Number of points over which to average the data.
   */
  adjustRoll(length: number) {
    this.rollPeriod_ = length;
    predraw(this);
  }

  /**
   * Returns a boolean array of visibility statuses.
   */
  visibility() {
    return visibility(this);
  }

  /**
   * Changes the visibility of one or more series.
   *
   * @param num the series index or an array of series indices
   *                                     or a boolean array of visibility states by index
   *                                     or an object mapping series numbers, as keys, to
   *                                     visibility state (boolean values)
   * @param value the visibility state expressed as a boolean
   */
  setVisibility(
    num: number | number[] | boolean[] | Record<string | number, boolean>,
    value?: boolean,
  ) {
    setVisibility(this, num, value);
  }

  /**
   * How large of an area will the zpgraph render itself in?
   * This is used for testing.
   * @return A {width: w, height: h} object.
   * @private
   */
  size() {
    return { width: this.width_, height: this.height_ };
  }

  /**
   * Update the list of annotations and redraw the chart.
   * See the annotations section of the README for more info.
   * @param ann {Array} An array of annotation objects.
   * @param suppressDraw {Boolean} Set to "true" to block chart redraw (optional).
   */
  setAnnotations(ann: Annotation[], suppressDraw?: boolean) {
    if (!Array.isArray(ann)) {
      throw new TypeError(
        "setAnnotations expects an array of annotations, got " + typeof ann,
      );
    }
    // Only add the annotation CSS rule once we know it will be used.
    this.annotations_ = ann;
    if (!this.layout_) {
      log.warn(
        "Tried to setAnnotations before zpgraph was ready. " +
          "Try setting them in a ready() block.",
      );
      return;
    }

    this.layout_.setAnnotations(this.annotations_);
    if (!suppressDraw) {
      predraw(this);
    }
  }

  /**
   * Return the list of annotations.
   */
  annotations() {
    return this.annotations_;
  }

  /**
   * Get the list of label names for this graph. The first column is the
   * x-axis, so the data series names start at index 1.
   *
   * Returns null when labels have not yet been defined.
   */
  getLabels() {
    const labels = this.attr_("labels");
    return Array.isArray(labels) ? labels.slice() : null;
  }

  /**
   * Get the index of a series (column) given its name. The first column is the
   * x-axis, so the data series start with index 1.
   */
  indexFromSetName(name: string) {
    return this.setIndexByName_[name];
  }

  /**
   * Find the row number corresponding to the given x-value.
   * Returns null if there is no such x-value in the data.
   * If there are multiple rows with the same x-value, this will return the
   * first one.
   * @param xVal The x-value to look for (e.g. millis since epoch).
   * @return The row number, which you can pass to getValue(), or null.
   */
  getRowForX(xVal: number) {
    let low = 0,
      high = this.numRows() - 1;

    while (low <= high) {
      const idx = (high + low) >> 1;
      const x = this.getValue(idx, 0);
      if (typeof x !== "number") {
        return null;
      }
      if (x < xVal) {
        low = idx + 1;
      } else if (x > xVal) {
        high = idx - 1;
      } else if (low !== idx) {
        // equal, but there may be an earlier match.
        high = idx;
      } else {
        return idx;
      }
    }

    return null;
  }

  /**
   * Trigger a callback when the zpgraph has drawn itself and is ready to be
   * manipulated. This is primarily useful when zpgraph has to do an XHR for the
   * data (i.e. a URL is passed as the data source) and the chart is drawn
   * asynchronously. If the chart has already drawn, the callback will fire
   * immediately.
   *
   * This is a good place to call setAnnotation().
   *
   * @param callback The callback to trigger when the chart
   *     is ready.
   */
  ready(callback: (g: Zpgraph) => void) {
    if (this.is_initial_draw_) {
      this.readyFns_.push(callback);
    } else {
      callback.call(this, this);
    }
  }

  /**
   * Add an event handler. This event handler is kept until the graph is
   * destroyed with a call to graph.destroy().
   *
   * @param elem The element to add the event to.
   * @param type The type of the event, e.g. 'click' or 'mousemove'.
   * @param fn The function to call
   *     on the event. The function takes one parameter: the event object.
   * @private
   */
  addAndTrackEvent(elem: EventTarget, type: string, fn: utils.DomEventHandler) {
    utils.addEvent(elem, type, fn);
    this.registeredEvents_.push({ elem, type, fn });
  }

  removeTrackedEvents_() {
    removeTrackedEvents_(this);
  }
}

registerZpgraphStatics(Zpgraph);

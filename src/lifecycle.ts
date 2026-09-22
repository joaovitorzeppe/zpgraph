/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import { log } from "./logger";
import DefaultHandler from "./datahandler/default";
import ErrorBarsHandler from "./datahandler/bars-error";
import CustomBarsHandler from "./datahandler/bars-custom";
import DefaultFractionHandler from "./datahandler/default-fractions";
import FractionsBarsHandler from "./datahandler/bars-fractions";
import DEFAULT_ATTRS from "./default-attrs";
import OptionsManager from "./options";
import { createDragInterface, createInterface } from "./dom";
import { parseArray, parseCSV, parseDataTable, isGvizDataTable } from "./parser";
import { predraw, renderGraph } from "./render";
import { applyTheme } from "./themes";
import { applyRootClassNames } from "./class-names";
import * as utils from "./utils";
import type {
  DataHandlerLike,
  PluginEventBase,
  PluginRegistration,
  ZpgraphInstance,
} from "./internal-types";
import type Zpgraph from "./zpgraph";
import type {
  Data,
  Plugin,
  Ticker,
  ZpgraphElement,
  ZpgraphOptions,
} from "./types";

const isTicker = (v: unknown): v is Ticker => typeof v === "function";

/** Shared prototype for cascade events — avoids per-call method closures. */
class PluginCascadeEvent implements PluginEventBase {
  zpgraph: ZpgraphInstance;
  cancelable = false;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(g: Zpgraph, extra_props?: Record<string, unknown>) {
    this.zpgraph = g;
    if (extra_props) {
      Object.assign(this, extra_props);
    }
  }

  preventDefault() {
    if (!this.cancelable) {
      throw new Error("Cannot call preventDefault on non-cancelable event.");
    }
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

type ZpgraphCtor = typeof import("./zpgraph").default;

const ctor = (g: Zpgraph): ZpgraphCtor => g.constructor;

export const removeTrackedEvents_ = (g: Zpgraph): void => {
  if (g.registeredEvents_) {
    for (let idx = 0; idx < g.registeredEvents_.length; idx++) {
      const reg = g.registeredEvents_[idx]!;
      utils.removeEvent(reg.elem, reg.type, reg.fn);
    }
  }

  g.registeredEvents_ = [];
};

const removeRecursive = (node: Node) => {
  while (node.firstChild) {
    removeRecursive(node.firstChild);
    node.firstChild.remove();
  }
};

const nullOut = (obj: object) => {
  for (const n of Object.keys(obj)) {
    if (typeof Reflect.get(obj, n) === "object") {
      Reflect.set(obj, n, null);
    }
  }
};

/**
 * Detach DOM elements in the zpgraph and null out all data references.
 * Calling this when you're done with a zpgraph can dramatically reduce memory
 * usage. See, e.g., the tests/perf.html example.
 */
export const destroy = (g: Zpgraph): void => {
  if (g.fileLoadAbort_) {
    g.fileLoadAbort_.abort();
    g.fileLoadAbort_ = null;
  }

  g.canvas_ctx_.restore();
  g.hidden_ctx_.restore();

  // Destroy any plugins, in the reverse order that they were registered.
  for (let i = g.plugins_.length - 1; i >= 0; i--) {
    const p = g.plugins_.pop();
    if (p?.plugin.destroy) {
      p.plugin.destroy();
    }
  }

  removeTrackedEvents_(g);

  // remove mouse event handlers (This may not be necessary anymore)
  utils.removeEvent(window, "mouseout", g.mouseOutHandler_);
  utils.removeEvent(g.mouseEventElement_, "mousemove", g.mouseMoveHandler_);

  // dispose of resizing handlers
  if (g.resizeObserver_) {
    g.resizeObserver_.disconnect();
    g.resizeObserver_ = null;
  }
  utils.removeEvent(window, "resize", g.resizeHandler_);
  g.resizeHandler_ = null;

  // A frame already requested would otherwise run against a torn-down chart.
  for (const handler of g.coalesced_) {
    handler.cancel();
  }
  g.coalesced_ = [];

  removeRecursive(g.maindiv_);

  // These may not all be necessary, but it can't hurt...
  if (g.layout_) {
    nullOut(g.layout_);
  }
  if (g.plotter_) {
    nullOut(g.plotter_);
  }
  nullOut(g);
};

/**
 * Generate a set of distinct colors for the data series. This is done with a
 * color wheel. Saturation/Value are customizable, and the hue is
 * equally-spaced around the color wheel. If a custom set of colors is
 * specified, that is used instead.
 * @private
 */
export const setColors_ = (g: Zpgraph): void => {
  const labels = g.getLabels();
  if (!labels) {
    return;
  }
  const num = labels.length - 1;
  g.colors_ = [];
  g.colorsMap_ = {};

  // These are used for when no custom colors are specified.
  const sat = g.getNumericOption("colorSaturation") || 1.0;
  const val = g.getNumericOption("colorValue") || 0.5;
  const half = Math.ceil(num / 2);

  const colors = g.user_attrs_.colors ?? g.attrs_.colors;
  const vis = visibility(g);
  for (let i = 0; i < num; i++) {
    if (!vis[i]) {
      continue;
    }
    const labelRaw = labels[i + 1];
    if (typeof labelRaw !== "string") {
      continue;
    }
    const label = labelRaw;
    const seriesColor = g.attributes_.getForSeries("color", label);
    let colorStr = typeof seriesColor === "string" ? seriesColor : undefined;
    if (!colorStr) {
      if (colors) {
        colorStr = colors[i % colors.length]!;
      } else {
        // alternate colors for high contrast.
        const idx = i % 2 ? half + (i + 1) / 2 : Math.ceil((i + 1) / 2);
        const hue = (1.0 * idx) / (1 + num);
        colorStr = utils.hsvToRGB(hue, sat, val);
      }
    }
    g.colors_.push(colorStr);
    g.colorsMap_[label] = colorStr;
  }
};

/** Returns a boolean array of visibility statuses. */
export const visibility = (g: Zpgraph): boolean[] => {
  // Do lazy-initialization, so that this happens after we know the number of
  // data series. Prefer the user-supplied array when present (getOption merge).
  let vis = g.user_attrs_.visibility ?? g.attrs_.visibility;
  if (!vis) {
    vis = [];
    g.attrs_.visibility = vis;
  }
  while (vis.length < g.numColumns() - 1) {
    vis.push(true);
  }
  return vis;
};

/**
 * Changes the visibility of one or more series.
 *
 * @param num the series index or an array of series indices
 *                                     or a boolean array of visibility states by index
 *                                     or an object mapping series numbers, as keys, to
 *                                     visibility state (boolean values)
 * @param value the visibility state expressed as a boolean
 */
type VisibilityInput =
  | number
  | number[]
  | boolean[]
  | Record<number | string, boolean>;

export const setVisibility = (
  g: Zpgraph,
  num: VisibilityInput,
  value?: boolean,
): void => {
  const x = visibility(g);

  if (!Array.isArray(num) && num !== null && typeof num === "object") {
    for (const i of Object.keys(num)) {
      const idx = Number(i);
      if (idx < 0 || idx >= x.length) {
        log.warn("Invalid series number in setVisibility: " + i);
      } else {
        x[idx] = num[i]!;
      }
    }
  } else {
    const list: Array<number | boolean> = Array.isArray(num) ? num : [num];
    for (let j = 0; j < list.length; j++) {
      const entry = list[j]!;
      if (typeof entry === "boolean") {
        if (j >= x.length) {
          log.warn("Invalid series number in setVisibility: " + j);
        } else {
          x[j] = entry;
        }
      } else {
        if (entry < 0 || entry >= x.length) {
          log.warn("Invalid series number in setVisibility: " + entry);
        } else {
          x[entry] = value ?? false;
        }
      }
    }
  }

  predraw(g);
};

/** Fires when there's data available to be graphed. @private */
export const loadedEvent_ = (g: Zpgraph, data: string): void => {
  g.rawData_ = parseCSV(g, data);
  g.cascadeDataDidUpdateEvent_();
  predraw(g);
};

/** Add ticks on the x-axis representing years, months, quarters, weeks, or days @private */
export const addXTicks_ = (g: Zpgraph): void => {
  // Determine the correct ticks scale on the x-axis: quarterly, monthly, ...
  let range;
  if (g.dateWindow_) {
    range = [g.dateWindow_[0], g.dateWindow_[1]];
  } else {
    range = g.xAxisExtremes();
  }

  const xAxisOptionsView = g.optionsViewForAxis_("x");
  const tickerOpt = xAxisOptionsView("ticker");
  if (!isTicker(tickerOpt)) {
    throw new Error("x-axis ticker option must be a function");
  }
  const ticker = tickerOpt;
  const xTicks = ticker(
    range[0]!,
    range[1]!,
    g.plotter_.area.w,
    xAxisOptionsView,
    g,
  );
  g.layout_.setXTicks(xTicks);
};

/**
 * Initializes the Zpgraph. This creates a new DIV and constructs the hidden
 * and context &lt;canvas&gt; inside of it. See the constructor for details.
 * on the parameters.
 * @param div the Element to render the graph into.
 * @param file Source data
 * @param attrs Miscellaneous other options
 * @private
 */
export const init = (
  g: Zpgraph,
  div: ZpgraphElement,
  file: Data,
  attrs: Partial<ZpgraphOptions> | null | undefined,
): void => {
  const Zpgraph = ctor(g);

  g.is_initial_draw_ = true;
  g.readyFns_ = [];

  // Support two-argument constructor
  if (attrs === null || attrs === undefined) {
    attrs = {};
  }

  attrs = Zpgraph.copyUserAttrs_(attrs);

  let container: HTMLElement;
  if (typeof div == "string") {
    const el = document.getElementById(div);
    if (!el) {
      throw new Error("Constructing zpgraph with a non-existent div!");
    }
    container = el;
  } else {
    container = div;
  }

  // Copy the important bits into the object
  g.maindiv_ = container;
  g.file_ = file;
  g.rollPeriod_ = attrs.rollPeriod || Zpgraph.DEFAULT_ROLL_PERIOD;
  g.previousVerticalX_ = -1;
  g.fractions_ = attrs.fractions || false;
  g.dateWindow_ = attrs.dateWindow || null;

  g.annotations_ = [];
  g.selPoints_ = [];

  // Clear the div. This ensure that, if multiple zpgraph are passed the same
  // div, then only one will be drawn.
  container.innerHTML = "";

  const resolved = window.getComputedStyle(container, null);
  if (
    resolved.paddingLeft !== "0px" ||
    resolved.paddingRight !== "0px" ||
    resolved.paddingTop !== "0px" ||
    resolved.paddingBottom !== "0px"
  ) {
    log.error("Main div contains padding; graph will misbehave");
  }

  // For historical reasons, the 'width' and 'height' options trump all CSS
  // rules _except_ for an explicit 'width' or 'height' on the div.
  // As an added convenience, if the div has zero height (like <div></div> does
  // without any styles), then we use a default height/width.
  if (container.style.width === "" && attrs.width) {
    container.style.width = attrs.width + "px";
  }
  if (container.style.height === "" && attrs.height) {
    container.style.height = attrs.height + "px";
  }
  if (container.style.height === "" && container.clientHeight === 0) {
    container.style.height = Zpgraph.DEFAULT_HEIGHT + "px";
    if (container.style.width === "") {
      container.style.width = Zpgraph.DEFAULT_WIDTH + "px";
    }
  }
  // These will be zero if the zpgraph's div is hidden. In that case,
  // use the user-specified attributes if present. If not, use zero
  // and assume the user will call resize to fix things later.
  g.width_ = container.clientWidth || attrs.width || 0;
  g.height_ = container.clientHeight || attrs.height || 0;

  if (attrs.stackedGraph) {
    attrs.fillGraph = true;
  }

  // DEPRECATION WARNING: All option processing should be moved from
  // attrs_ and user_attrs_ to options_, which holds all this information.
  //
  // Zpgraph has many options, some of which interact with one another.
  // To keep track of everything, we maintain two sets of options:
  //
  //  g.user_attrs_   only options explicitly set by the user.
  //  g.attrs_        defaults, options derived from user_attrs_, data.
  //
  // Options are then accessed g.attr_('attr'), which first looks at
  // user_attrs_ and then computed attrs_. This way Zpgraph can set intelligent
  // defaults without overriding behavior that the user specifically asks for.
  g.user_attrs_ = {};
  utils.update(g.user_attrs_, attrs);

  // This sequence ensures that Zpgraph.DEFAULT_ATTRS is never modified.
  g.attrs_ = {};
  utils.updateDeep(g.attrs_, DEFAULT_ATTRS);

  g.boundaryIds_ = [];
  g.setIndexByName_ = {};
  g.datasetIndex_ = [];

  g.registeredEvents_ = [];
  g.eventListeners_ = {};

  g.attributes_ = new OptionsManager(g);

  // Create the containing DIV and other interactive elements
  createInterface(g);
  applyTheme(g);
  applyRootClassNames(g);

  // Activate plugins.
  g.plugins_ = [];
  const userPlugins = g.user_attrs_.plugins ?? g.attrs_.plugins ?? [];
  const plugins = Zpgraph.PLUGINS.concat(userPlugins);
  for (let i = 0; i < plugins.length; i++) {
    // the plugins option may contain either plugin classes or instances.
    // Plugin instances contain an activate method.
    const PluginOrCtor = plugins[i]!;
    let pluginInstance: Plugin;
    if (typeof PluginOrCtor === "function") {
      pluginInstance = new PluginOrCtor();
    } else {
      pluginInstance = PluginOrCtor;
    }

    const pluginDict: PluginRegistration = {
      plugin: pluginInstance,
      events: {},
      options: {},
      pluginOptions: {},
    };

    const handlers = pluginInstance.activate(g) ?? {};
    for (const eventName of Object.keys(handlers)) {
      const handler: unknown = Reflect.get(handlers, eventName);
      if (typeof handler === "function") {
        // cascadeEvents_ uses callback.call(plugin, e) — preserve `this`.
        pluginDict.events[eventName] = function (
          this: unknown,
          ...args: unknown[]
        ) {
          return Reflect.apply(handler, this, args);
        };
      }
    }

    g.plugins_.push(pluginDict);
  }

  // At this point, plugins can no longer register event handlers.
  // Construct a map from event -> ordered list of [callback, plugin].
  for (let i = 0; i < g.plugins_.length; i++) {
    const plugin_dict = g.plugins_[i]!;
    for (const eventName in plugin_dict.events) {
      if (!Object.hasOwn(plugin_dict.events, eventName)) {
        continue;
      }
      const callback = plugin_dict.events[eventName];
      if (!callback) {
        continue;
      }

      const pair: [Plugin, (...args: unknown[]) => unknown] = [
        plugin_dict.plugin,
        callback,
      ];
      if (!(eventName in g.eventListeners_)) {
        g.eventListeners_[eventName] = [pair];
      } else {
        g.eventListeners_[eventName]!.push(pair);
      }
    }
  }

  createDragInterface(g);

  start(g);
};

/**
 * Triggers a cascade of events to the various plugins which are interested in them.
 * Returns true if the "default behavior" should be prevented, i.e. if one
 * of the event listeners called event.preventDefault().
 * @private
 */
export const cascadeEvents_ = (
  g: Zpgraph,
  name: string,
  extra_props?: Record<string, unknown>,
): boolean => {
  if (!(name in g.eventListeners_)) {
    return false;
  }

  const e = new PluginCascadeEvent(g, extra_props);

  const callback_plugin_pairs = g.eventListeners_[name];
  if (callback_plugin_pairs) {
    for (let i = callback_plugin_pairs.length - 1; i >= 0; i--) {
      const pair = callback_plugin_pairs[i]!;
      const plugin = pair[0];
      const callback = pair[1];
      callback.call(plugin, e);
      if (e.propagationStopped) {
        break;
      }
    }
  }
  return e.defaultPrevented;
};

/**
 * Get the CSV data. If it's in a function, call that function. If it's in a
 * file, fetch it.
 * @private
 */
export const start = (g: Zpgraph): void => {
  let data: unknown = g.file_;

  // Functions can return references of all other types.
  if (typeof data == "function") {
    data = data();
  }

  if (Array.isArray(data)) {
    const parsed = parseArray(g, data);
    g.rawData_ = parsed ?? [];
    g.cascadeDataDidUpdateEvent_();
    predraw(g);
  } else if (isGvizDataTable(data)) {
    // must be a DataTable from gviz.
    parseDataTable(g, data);
    g.cascadeDataDidUpdateEvent_();
    predraw(g);
  } else if (typeof data === "string") {
    // Heuristic: a newline means it's CSV data. Otherwise it's an URL.
    const text = data;
    const line_delimiter = utils.detectLineDelimiter(text);
    if (line_delimiter) {
      g.loadedEvent_(text);
    } else {
      if (g.fileLoadAbort_) {
        g.fileLoadAbort_.abort();
      }
      const controller = new AbortController();
      g.fileLoadAbort_ = controller;
      fetch(text, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error("HTTP " + response.status + " loading " + data);
          }
          return response.text();
        })
        .then((body: string) => {
          if (g.fileLoadAbort_ !== controller) {
            return;
          }
          g.fileLoadAbort_ = null;
          g.loadedEvent_(body);
        })
        .catch((err) => {
          if (err?.name === "AbortError") {
            return;
          }
          if (g.fileLoadAbort_ === controller) {
            g.fileLoadAbort_ = null;
          }
          const onError = g.getFunctionOption("dataLoadErrorCallback");
          if (onError) {
            onError.call(g, err, data, g);
          } else {
            log.error("Failed to load chart data from " + data, err);
          }
        });
    }
  } else {
    const datatype = utils.typeArrayLike(data);
    throw new TypeError(
      "Zpgraph: unsupported data (" +
        datatype +
        "). Pass an array of rows, a CSV " +
        "string, a URL, a gviz DataTable or a function returning one of those.",
    );
  }
};

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
export const updateOptions = (
  g: Zpgraph,
  input_attrs: Partial<ZpgraphOptions>,
  block_redraw?: boolean,
): void => {
  const Zpgraph = ctor(g);

  if (
    input_attrs === null ||
    typeof input_attrs !== "object" ||
    Array.isArray(input_attrs)
  ) {
    throw new TypeError(
      "updateOptions expects an options object, got " +
        (Array.isArray(input_attrs) ? "an array" : typeof input_attrs),
    );
  }
  if (typeof block_redraw == "undefined") {
    block_redraw = false;
  }

  // copyUserAttrs_ drops the "file" parameter as a convenience to us.
  const file = input_attrs.file;
  const attrs = Zpgraph.copyUserAttrs_(input_attrs);
  const prevNumAxes = g.attributes_.numAxes();

  if ("rollPeriod" in attrs) {
    g.rollPeriod_ = attrs.rollPeriod;
  }
  if ("dateWindow" in attrs) {
    g.dateWindow_ = attrs.dateWindow;
  }

  // Supported:
  // strokeWidth
  // pointSize
  // drawPoints
  // highlightCircleSize

  // Check if this set options will require new points.
  const labelsForPoints = (g.getLabels() ?? []).filter(
    (l): l is string => typeof l === "string",
  );
  const requiresNewPoints = utils.isPixelChangingOptionList(
    labelsForPoints,
    attrs,
  );

  utils.updateDeep(g.user_attrs_, attrs);

  // Sugar: markers / states map onto existing draw/highlight options.
  const markers = g.user_attrs_.markers;
  if (markers) {
    if (g.user_attrs_.drawPoints == null) {
      g.user_attrs_.drawPoints = true;
    }
    if (markers.size != null && g.user_attrs_.pointSize == null) {
      g.user_attrs_.pointSize = markers.size;
    }
  }
  const states = g.user_attrs_.states;
  if (states?.hover?.dimOthers && g.user_attrs_.highlightSeriesOpts == null) {
    g.user_attrs_.highlightSeriesOpts = { strokeWidth: 2 };
  }

  if ("theme" in attrs) {
    applyTheme(g);
  }
  if ("classNames" in attrs) {
    applyRootClassNames(g);
  }

  g.attributes_.reparseSeries();

  if (prevNumAxes < g.attributes_.numAxes()) {
    g.plotter_.clear();
  }
  if (file) {
    // This event indicates that the data is about to change, but hasn't yet.
    cascadeEvents_(g, "dataWillUpdate", {});

    g.file_ = file;
    if (!block_redraw) {
      start(g);
    }
  } else {
    if (!block_redraw) {
      if (requiresNewPoints) {
        predraw(g);
      } else {
        renderGraph(g, false);
      }
    }
  }
};

/** Returns the correct handler class for the currently set options. @private */
export const getHandlerClass_ = (g: Zpgraph): new () => DataHandlerLike => {
  const customHandler = g.user_attrs_.dataHandler ?? g.attrs_.dataHandler;
  if (customHandler) {
    return customHandler;
  }
  if (g.fractions_) {
    if (g.getBooleanOption("errorBars")) {
      return FractionsBarsHandler;
    }
    return DefaultFractionHandler;
  }
  if (g.getBooleanOption("customBars")) {
    return CustomBarsHandler;
  }
  if (g.getBooleanOption("errorBars")) {
    return ErrorBarsHandler;
  }
  return DefaultHandler;
};

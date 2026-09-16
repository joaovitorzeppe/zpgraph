/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import { log } from './logger';
import DefaultHandler from './datahandler/default';
import ErrorBarsHandler from './datahandler/bars-error';
import CustomBarsHandler from './datahandler/bars-custom';
import DefaultFractionHandler from './datahandler/default-fractions';
import FractionsBarsHandler from './datahandler/bars-fractions';
import DEFAULT_ATTRS from './default-attrs';
import OptionsManager from './options';
import { createDragInterface, createInterface } from './dom';
import { parseArray, parseCSV, parseDataTable } from './parser';
import { predraw, renderGraph } from './render';
import * as utils from './utils';
import type { DataHandlerLike, PluginRegistration } from './internal-types';
import type Zgraph from './zgraph';
import type {
  Data,
  DataArray,
  Plugin,
  Ticker,
  ZgraphElement,
  ZgraphOptions,
} from './types';

type ZgraphCtor = typeof import('./zgraph').default;

const ctor = (g: Zgraph): ZgraphCtor => g.constructor as ZgraphCtor;

export const removeTrackedEvents_ = (g: Zgraph): void => {
  if (g.registeredEvents_) {
    for (let idx = 0; idx < g.registeredEvents_.length; idx++) {
      const reg = g.registeredEvents_[idx]!;
      utils.removeEvent(reg.elem, reg.type, reg.fn);
    }
  }

  g.registeredEvents_ = [];
};

/**
 * Detach DOM elements in the zgraph and null out all data references.
 * Calling this when you're done with a zgraph can dramatically reduce memory
 * usage. See, e.g., the tests/perf.html example.
 */
export const destroy = (g: Zgraph): void => {
  if (g.fileLoadAbort_) {
    g.fileLoadAbort_.abort();
    g.fileLoadAbort_ = null;
  }

  g.canvas_ctx_.restore();
  g.hidden_ctx_.restore();

  // Destroy any plugins, in the reverse order that they were registered.
  for (let i = g.plugins_.length - 1; i >= 0; i--) {
    const p = g.plugins_.pop();
    if (p?.plugin.destroy) p.plugin.destroy();
  }

  let removeRecursive = function (node: Node) {
    while (node.hasChildNodes()) {
      removeRecursive(node.firstChild!);
      node.removeChild(node.firstChild!);
    }
  };

  removeTrackedEvents_(g);

  // remove mouse event handlers (This may not be necessary anymore)
  utils.removeEvent(window, 'mouseout', g.mouseOutHandler_ as EventListener);
  utils.removeEvent(
    g.mouseEventElement_,
    'mousemove',
    g.mouseMoveHandler_ as EventListener,
  );

  // dispose of resizing handlers
  if (g.resizeObserver_) {
    g.resizeObserver_.disconnect();
    g.resizeObserver_ = null;
  }
  utils.removeEvent(window, 'resize', g.resizeHandler_ as EventListener);
  g.resizeHandler_ = null;

  // A frame already requested would otherwise run against a torn-down chart.
  for (const handler of g.coalesced_) handler.cancel();
  g.coalesced_ = [];

  removeRecursive(g.maindiv_);

  let nullOut = function nullOut(obj: Record<string, unknown>) {
    for (let n in obj) {
      if (typeof obj[n] === 'object') {
        obj[n] = null;
      }
    }
  };
  // These may not all be necessary, but it can't hurt...
  nullOut(g.layout_ as unknown as Record<string, unknown>);
  nullOut(g.plotter_ as unknown as Record<string, unknown>);
  nullOut(g as unknown as Record<string, unknown>);
};

/**
 * Generate a set of distinct colors for the data series. This is done with a
 * color wheel. Saturation/Value are customizable, and the hue is
 * equally-spaced around the color wheel. If a custom set of colors is
 * specified, that is used instead.
 * @private
 */
export const setColors_ = (g: Zgraph): void => {
  let labels = g.getLabels();
  if (!labels) return;
  let num = labels.length - 1;
  g.colors_ = [];
  g.colorsMap_ = {};

  // These are used for when no custom colors are specified.
  let sat = g.getNumericOption('colorSaturation') || 1.0;
  let val = g.getNumericOption('colorValue') || 0.5;
  let half = Math.ceil(num / 2);

  let colors = g.getOption('colors') as string[] | undefined;
  let vis = visibility(g);
  for (let i = 0; i < num; i++) {
    if (!vis[i]) {
      continue;
    }
    let label = labels[i + 1]!;
    let colorStr = g.attributes_.getForSeries('color', label) as
      string | undefined;
    if (!colorStr) {
      if (colors) {
        colorStr = colors[i % colors.length]!;
      } else {
        // alternate colors for high contrast.
        let idx = i % 2 ? half + (i + 1) / 2 : Math.ceil((i + 1) / 2);
        let hue = (1.0 * idx) / (1 + num);
        colorStr = utils.hsvToRGB(hue, sat, val);
      }
    }
    g.colors_.push(colorStr);
    g.colorsMap_[label] = colorStr;
  }
};

/** Returns a boolean array of visibility statuses. */
export const visibility = (g: Zgraph): boolean[] => {
  // Do lazy-initialization, so that this happens after we know the number of
  // data series.
  if (!g.getOption('visibility')) {
    g.attrs_.visibility = [];
  }
  while ((g.getOption('visibility') as boolean[]).length < g.numColumns() - 1) {
    g.attrs_.visibility!.push(true);
  }
  return g.getOption('visibility') as boolean[];
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
  number | number[] | boolean[] | Record<number | string, boolean>;

export const setVisibility = (
  g: Zgraph,
  num: VisibilityInput,
  value?: boolean,
): void => {
  let x = visibility(g);
  let numIsObject = false;

  if (!Array.isArray(num)) {
    if (num !== null && typeof num === 'object') {
      numIsObject = true;
    } else {
      num = [num];
    }
  }

  if (numIsObject) {
    const map = num as Record<string, boolean>;
    for (let i in map) {
      if (Object.hasOwn(map, i)) {
        let idx = Number(i);
        if (idx < 0 || idx >= x.length) {
          log.warn('Invalid series number in setVisibility: ' + i);
        } else {
          x[idx] = map[i]!;
        }
      }
    }
  } else {
    const list = num as number[] | boolean[];
    for (let j = 0; j < list.length; j++) {
      const entry = list[j]!;
      if (typeof entry === 'boolean') {
        if (j >= x.length) {
          log.warn('Invalid series number in setVisibility: ' + j);
        } else {
          x[j] = entry;
        }
      } else {
        if (entry < 0 || entry >= x.length) {
          log.warn('Invalid series number in setVisibility: ' + entry);
        } else {
          x[entry] = value ?? false;
        }
      }
    }
  }

  predraw(g);
};

/** Fires when there's data available to be graphed. @private */
export const loadedEvent_ = (g: Zgraph, data: string): void => {
  g.rawData_ = parseCSV(g, data);
  g.cascadeDataDidUpdateEvent_();
  predraw(g);
};

/** Add ticks on the x-axis representing years, months, quarters, weeks, or days @private */
export const addXTicks_ = (g: Zgraph): void => {
  // Determine the correct ticks scale on the x-axis: quarterly, monthly, ...
  let range;
  if (g.dateWindow_) {
    range = [g.dateWindow_[0], g.dateWindow_[1]];
  } else {
    range = g.xAxisExtremes();
  }

  let xAxisOptionsView = g.optionsViewForAxis_('x');
  const ticker = xAxisOptionsView('ticker') as Ticker;
  let xTicks = ticker(
    range[0]!,
    range[1]!,
    g.plotter_.area.w,
    xAxisOptionsView,
    g,
  );
  g.layout_.setXTicks(xTicks);
};

/**
 * Initializes the Zgraph. This creates a new DIV and constructs the hidden
 * and context &lt;canvas&gt; inside of it. See the constructor for details.
 * on the parameters.
 * @param div the Element to render the graph into.
 * @param file Source data
 * @param attrs Miscellaneous other options
 * @private
 */
export const init = (
  g: Zgraph,
  div: ZgraphElement,
  file: Data,
  attrs: Partial<ZgraphOptions> | null | undefined,
): void => {
  const Zgraph = ctor(g);

  g.is_initial_draw_ = true;
  g.readyFns_ = [];

  // Support two-argument constructor
  if (attrs === null || attrs === undefined) {
    attrs = {};
  }

  attrs = Zgraph.copyUserAttrs_(attrs);

  let container: HTMLElement;
  if (typeof div == 'string') {
    const el = document.getElementById(div);
    if (!el) {
      throw new Error('Constructing zgraph with a non-existent div!');
    }
    container = el;
  } else {
    container = div;
  }

  // Copy the important bits into the object
  g.maindiv_ = container;
  g.file_ = file;
  g.rollPeriod_ = attrs.rollPeriod || Zgraph.DEFAULT_ROLL_PERIOD;
  g.previousVerticalX_ = -1;
  g.fractions_ = attrs.fractions || false;
  g.dateWindow_ = attrs.dateWindow || null;

  g.annotations_ = [];
  g.selPoints_ = [];

  // Clear the div. This ensure that, if multiple zgraph are passed the same
  // div, then only one will be drawn.
  container.innerHTML = '';

  const resolved = window.getComputedStyle(container, null);
  if (
    resolved.paddingLeft !== '0px' ||
    resolved.paddingRight !== '0px' ||
    resolved.paddingTop !== '0px' ||
    resolved.paddingBottom !== '0px'
  )
    log.error('Main div contains padding; graph will misbehave');

  // For historical reasons, the 'width' and 'height' options trump all CSS
  // rules _except_ for an explicit 'width' or 'height' on the div.
  // As an added convenience, if the div has zero height (like <div></div> does
  // without any styles), then we use a default height/width.
  if (container.style.width === '' && attrs.width) {
    container.style.width = attrs.width + 'px';
  }
  if (container.style.height === '' && attrs.height) {
    container.style.height = attrs.height + 'px';
  }
  if (container.style.height === '' && container.clientHeight === 0) {
    container.style.height = Zgraph.DEFAULT_HEIGHT + 'px';
    if (container.style.width === '') {
      container.style.width = Zgraph.DEFAULT_WIDTH + 'px';
    }
  }
  // These will be zero if the zgraph's div is hidden. In that case,
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
  // Zgraph has many options, some of which interact with one another.
  // To keep track of everything, we maintain two sets of options:
  //
  //  g.user_attrs_   only options explicitly set by the user.
  //  g.attrs_        defaults, options derived from user_attrs_, data.
  //
  // Options are then accessed g.attr_('attr'), which first looks at
  // user_attrs_ and then computed attrs_. This way Zgraph can set intelligent
  // defaults without overriding behavior that the user specifically asks for.
  g.user_attrs_ = {};
  utils.update(g.user_attrs_ as Record<string, unknown>, attrs);

  // This sequence ensures that Zgraph.DEFAULT_ATTRS is never modified.
  g.attrs_ = {} as typeof g.attrs_;
  utils.updateDeep(g.attrs_ as Record<string, unknown>, DEFAULT_ATTRS);

  g.boundaryIds_ = [];
  g.setIndexByName_ = {};
  g.datasetIndex_ = [];

  g.registeredEvents_ = [];
  g.eventListeners_ = {};

  g.attributes_ = new OptionsManager(g);

  // Create the containing DIV and other interactive elements
  createInterface(g);

  // Activate plugins.
  g.plugins_ = [];
  const userPlugins =
    (g.getOption('plugins') as
      Array<(new () => Plugin) | Plugin> | undefined) ?? [];
  let plugins = Zgraph.PLUGINS.concat(userPlugins);
  for (let i = 0; i < plugins.length; i++) {
    // the plugins option may contain either plugin classes or instances.
    // Plugin instances contain an activate method.
    const Plugin = plugins[i]!; // either a constructor or an instance.
    let pluginInstance: Plugin;
    if (typeof (Plugin as Plugin).activate !== 'undefined') {
      pluginInstance = Plugin as Plugin;
    } else {
      pluginInstance = new (Plugin as new () => Plugin)();
    }

    const pluginDict: PluginRegistration = {
      plugin: pluginInstance,
      events: {},
      options: {},
      pluginOptions: {},
    };

    const handlers = (pluginInstance.activate(g) ?? {}) as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    for (let eventName in handlers) {
      if (!Object.hasOwn(handlers, eventName)) continue;
      pluginDict.events[eventName] = handlers[eventName]!;
    }

    g.plugins_.push(pluginDict);
  }

  // At this point, plugins can no longer register event handlers.
  // Construct a map from event -> ordered list of [callback, plugin].
  for (let i = 0; i < g.plugins_.length; i++) {
    const plugin_dict = g.plugins_[i]!;
    for (let eventName in plugin_dict.events) {
      if (!Object.hasOwn(plugin_dict.events, eventName)) continue;
      const callback = plugin_dict.events[eventName];
      if (!callback) continue;

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
  g: Zgraph,
  name: string,
  extra_props?: Record<string, unknown>,
): boolean => {
  if (!(name in g.eventListeners_)) return false;

  // QUESTION: can we use objects & prototypes to speed this up?
  let e = {
    zgraph: g,
    cancelable: false,
    defaultPrevented: false,
    preventDefault: function () {
      if (!e.cancelable)
        throw new Error('Cannot call preventDefault on non-cancelable event.');
      e.defaultPrevented = true;
    },
    propagationStopped: false,
    stopPropagation: function () {
      e.propagationStopped = true;
    },
  };
  utils.update(e, extra_props);

  let callback_plugin_pairs = g.eventListeners_[name];
  if (callback_plugin_pairs) {
    for (let i = callback_plugin_pairs.length - 1; i >= 0; i--) {
      const pair = callback_plugin_pairs[i]!;
      const plugin = pair[0];
      const callback = pair[1];
      callback.call(plugin, e);
      if (e.propagationStopped) break;
    }
  }
  return e.defaultPrevented;
};

/**
 * Get the CSV data. If it's in a function, call that function. If it's in a
 * file, fetch it.
 * @private
 */
export const start = (g: Zgraph): void => {
  let data: unknown = g.file_;

  // Functions can return references of all other types.
  if (typeof data == 'function') {
    data = data();
  }

  const datatype = utils.typeArrayLike(data);
  if (datatype === 'array') {
    g.rawData_ = parseArray(g, data as DataArray) as typeof g.rawData_;
    g.cascadeDataDidUpdateEvent_();
    predraw(g);
  } else if (
    datatype === 'object' &&
    typeof (data as { getColumnRange?: unknown }).getColumnRange == 'function'
  ) {
    // must be a DataTable from gviz.
    parseDataTable(g, data as Parameters<typeof parseDataTable>[1]);
    g.cascadeDataDidUpdateEvent_();
    predraw(g);
  } else if (datatype === 'string') {
    // Heuristic: a newline means it's CSV data. Otherwise it's an URL.
    const text = data as string;
    let line_delimiter = utils.detectLineDelimiter(text);
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
            throw new Error('HTTP ' + response.status + ' loading ' + data);
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
          if (err && err.name === 'AbortError') {
            return;
          }
          if (g.fileLoadAbort_ === controller) {
            g.fileLoadAbort_ = null;
          }
          const onError = g.getFunctionOption('dataLoadErrorCallback');
          if (onError) {
            onError.call(g, err, data, g);
          } else {
            log.error('Failed to load chart data from ' + data, err);
          }
        });
    }
  } else {
    throw new TypeError(
      'Zgraph: unsupported data (' +
        datatype +
        '). Pass an array of rows, a CSV ' +
        'string, a URL, a gviz DataTable or a function returning one of those.',
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
  g: Zgraph,
  input_attrs: Partial<ZgraphOptions>,
  block_redraw?: boolean,
): void => {
  const Zgraph = ctor(g);

  if (
    input_attrs === null ||
    typeof input_attrs !== 'object' ||
    Array.isArray(input_attrs)
  ) {
    throw new TypeError(
      'updateOptions expects an options object, got ' +
        (Array.isArray(input_attrs) ? 'an array' : typeof input_attrs),
    );
  }
  if (typeof block_redraw == 'undefined') block_redraw = false;

  // copyUserAttrs_ drops the "file" parameter as a convenience to us.
  let file = input_attrs.file;
  let attrs = Zgraph.copyUserAttrs_(input_attrs);
  let prevNumAxes = g.attributes_.numAxes();

  if ('rollPeriod' in attrs) {
    g.rollPeriod_ = attrs.rollPeriod;
  }
  if ('dateWindow' in attrs) {
    g.dateWindow_ = attrs.dateWindow;
  }

  // Supported:
  // strokeWidth
  // pointSize
  // drawPoints
  // highlightCircleSize

  // Check if this set options will require new points.
  let requiresNewPoints = utils.isPixelChangingOptionList(
    g.attr_('labels') as string[],
    attrs,
  );

  utils.updateDeep(g.user_attrs_ as Record<string, unknown>, attrs);

  g.attributes_.reparseSeries();

  if (prevNumAxes < g.attributes_.numAxes()) g.plotter_.clear();
  if (file) {
    // This event indicates that the data is about to change, but hasn't yet.
    cascadeEvents_(g, 'dataWillUpdate', {});

    g.file_ = file;
    if (!block_redraw) start(g);
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
export const getHandlerClass_ = (g: Zgraph): new () => DataHandlerLike => {
  let handlerClass: new () => DataHandlerLike;
  if (g.attr_('dataHandler')) {
    handlerClass = g.attr_('dataHandler') as new () => DataHandlerLike;
  } else if (g.fractions_) {
    if (g.getBooleanOption('errorBars')) {
      handlerClass = FractionsBarsHandler;
    } else {
      handlerClass = DefaultFractionHandler;
    }
  } else if (g.getBooleanOption('customBars')) {
    handlerClass = CustomBarsHandler;
  } else if (g.getBooleanOption('errorBars')) {
    handlerClass = ErrorBarsHandler;
  } else {
    handlerClass = DefaultHandler;
  }
  return handlerClass;
};

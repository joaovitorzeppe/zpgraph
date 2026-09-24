"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * @fileoverview OptionsManager is responsible for parsing and returning
 * information about options.
 */

import * as utils from "./utils";
import { log } from "./logger";
import DEFAULT_ATTRS_ from "./default-attrs";
import OPTIONS_REFERENCE_ from "./options-reference";
import type Zpgraph from "./zpgraph";
import type { ZpgraphOptions } from "./types";

const DEFAULT_ATTRS: typeof DEFAULT_ATTRS_ = DEFAULT_ATTRS_;

const isDefaultAxisKey = (
  key: string,
): key is keyof typeof DEFAULT_ATTRS.axes =>
  key === "x" || key === "y" || key === "y2";
const OPTIONS_REFERENCE: Record<string, unknown> | null = OPTIONS_REFERENCE_;

/** Old name <-> new name. Either key in user options satisfies a read of the other. */
const OPTION_ALIASES: Record<string, string> = {
  xRangePad: "xRangePadding",
  xRangePadding: "xRangePad",
  yRangePad: "yRangePadding",
  yRangePadding: "yRangePad",
  rangeSelectorVeilColour: "rangeSelectorVeilColor",
  rangeSelectorVeilColor: "rangeSelectorVeilColour",
};

let WARNINGS: Record<string, boolean> = {}; // Only show any particular warning once.

interface AxisBucket {
  series: string[];
  options: Record<string, unknown>;
}

interface SeriesEntry {
  idx: number;
  yAxis: number;
  options: Record<string, unknown>;
}

/*
 * Member variables:
 * global_ - global attributes (common among all graphs, AIUI)
 * user - attributes set by the user
 * series_ - { seriesName -> { idx, yAxis, options }}
 */

/**
 * This parses attributes into an object that can be easily queried.
 *
 * It doesn't necessarily mean that all options are available, specifically
 * if labels are not yet available, since those drive details of the per-series
 * and per-axis options.
 *
 * @param zpgraph The chart to which these options belong.
 * @constructor
 */
class OptionsManager {
  zpgraph_: Zpgraph;
  yAxes_: AxisBucket[];
  xAxis_: { options: Record<string, unknown> };
  series_: Record<string, SeriesEntry>;
  global_: ZpgraphOptions;
  user_: ZpgraphOptions;
  labels_: string[];
  highlightSeries_: Record<string, unknown>;

  /**
   * Not optimal, but does the trick when you're only using two axes.
   * If we move to more axes, this can just become a function.
   *

   * @private
   */
  static AXIS_STRING_MAPPINGS_: Record<string, number> = {
    y: 0,
    Y: 0,
    y1: 0,
    Y1: 0,
    y2: 1,
    Y2: 1,
  };

  /**
   * @param axis
   * @private
   */
  static axisToIndex_(axis: unknown): number {
    if (typeof axis == "string") {
      if (Object.hasOwn(OptionsManager.AXIS_STRING_MAPPINGS_, axis)) {
        const mapped = OptionsManager.AXIS_STRING_MAPPINGS_[axis];
        if (mapped !== undefined) {
          return mapped;
        }
      }
      throw new Error("Unknown axis : " + axis);
    }
    if (typeof axis == "number") {
      if (axis === 0 || axis === 1) {
        return axis;
      }
      throw new Error("Zpgraph only supports two y-axes, indexed from 0-1.");
    }
    if (axis) {
      throw new Error("Unknown axis");
    }
    // No axis specification means axis 0.
    return 0;
  }

  // Reset list of previously-shown warnings. Used for testing.
  static resetWarnings_() {
    WARNINGS = {};
  }

  constructor(zpgraph: Zpgraph) {
    /**
     * The zpgraph.

     */
    this.zpgraph_ = zpgraph;

    /**
     * Array of axis index to { series : [ series names ] , options : { axis-specific options. } }
     * >} @private
     */
    this.yAxes_ = [];

    /**
     * Contains x-axis specific options, which are stored in the options key.
     * This matches the yAxes_ object structure (by being a dictionary with an
     * options element) allowing for shared code.
     *  @private
     */
    this.xAxis_ = { options: {} };
    this.series_ = {};

    // Once these two objects are initialized, you can call get();
    this.global_ = this.zpgraph_.attrs_;
    this.user_ = this.zpgraph_.user_attrs_ || {};

    /**
     * A list of series in columnar order.

     */
    this.labels_ = [];

    this.highlightSeries_ = {};
    const highlightOpts = this.get("highlightSeriesOpts");
    if (highlightOpts !== null && typeof highlightOpts === "object") {
      utils.update(this.highlightSeries_, highlightOpts);
    }
    this.reparseSeries();
  }

  /**
   * Reparses options that are all related to series. This typically occurs when
   * options are either updated, or source data has been made available.
   */
  reparseSeries() {
    const rawLabels = this.get("labels");
    if (!Array.isArray(rawLabels)) {
      return; // -- can't do more for now, will parse after getting the labels.
    }
    if (!rawLabels.every((x): x is string => typeof x === "string")) {
      return;
    }
    const labels = rawLabels;

    utils.validateSeriesLabels(labels);

    this.labels_ = labels.slice(1);

    this.yAxes_ = [{ series: [], options: {} }]; // Always one axis at least.
    this.xAxis_ = { options: {} };
    this.series_ = {};

    // Series are specified in the series element:
    //
    // {
    //   labels: [ "X", "foo", "bar" ],
    //   pointSize: 3,
    //   series : {
    //     foo : {}, // options for foo
    //     bar : {} // options for bar
    //   }
    // }
    //
    // So, if series is found, it's expected to contain per-series data,
    // otherwise set a default.
    const seriesDict = this.user_.series ?? {};
    for (let idx = 0; idx < this.labels_.length; idx++) {
      const seriesName = this.labels_[idx]!;
      const optionsForSeries: Record<string, unknown> = {};
      utils.update(optionsForSeries, seriesDict[seriesName] || {});
      const yAxis = OptionsManager.axisToIndex_(optionsForSeries["axis"]);

      this.series_[seriesName] = {
        idx: idx,
        yAxis: yAxis,
        options: optionsForSeries,
      };

      if (!this.yAxes_[yAxis]) {
        this.yAxes_[yAxis] = { series: [seriesName], options: {} };
      } else {
        this.yAxes_[yAxis].series.push(seriesName);
      }
    }

    const axis_opts = this.user_.axes ?? {};
    utils.update(this.yAxes_[0]!.options, axis_opts["y"] || {});
    if (this.yAxes_.length > 1) {
      utils.update(this.yAxes_[1]!.options, axis_opts["y2"] || {});
    }
    utils.update(this.xAxis_.options, axis_opts["x"] || {});

    this.validateOptions_();
  }

  /**
   * Get a global value.
   *
   * @param name the name of the option.
   */
  get(name: string): unknown {
    const result = this.getGlobalUser_(name);
    if (result !== null) {
      return result;
    }
    return this.getGlobalDefault_(name);
  }

  getGlobalUser_(name: string): unknown {
    if (Object.hasOwn(this.user_, name)) {
      return Reflect.get(this.user_, name);
    }
    const alias = OPTION_ALIASES[name];
    if (alias && Object.hasOwn(this.user_, alias)) {
      return Reflect.get(this.user_, alias);
    }
    return null;
  }

  getGlobalDefault_(name: string): unknown {
    if (Object.hasOwn(this.global_, name)) {
      return Reflect.get(this.global_, name);
    }
    if (Object.hasOwn(DEFAULT_ATTRS, name)) {
      return Reflect.get(DEFAULT_ATTRS, name);
    }
    return null;
  }

  /**
   * Get a value for a specific axis. If there is no specific value for the axis,
   * the global value is returned.
   *
   * @param name the name of the option.
   * @param axis the axis to search. Can be the string representation
   * ("y", "y2") or the axis number (0, 1).
   */
  getForAxis(name: string, axis: string | number): unknown {
    let axisIdx: number;
    let axisString: string;

    // Since axis can be a number or a string, straighten everything out here.
    if (typeof axis == "number") {
      axisIdx = axis;
      axisString = axisIdx === 0 ? "y" : "y2";
    } else {
      if (axis === "y1") {
        axis = "y";
      } // Standardize on 'y'. Is this bad? I think so.
      if (axis === "y") {
        axisIdx = 0;
      } else if (axis === "y2") {
        axisIdx = 1;
      } else if (axis === "x") {
        axisIdx = -1; // simply a placeholder for below.
      } else {
        throw new Error("Unknown axis " + axis);
      }
      axisString = axis;
    }

    const userAxis = axisIdx === -1 ? this.xAxis_ : this.yAxes_[axisIdx];

    // Search the user-specified axis option first.
    if (userAxis) {
      // This condition could be removed if we always set up this.yAxes_ for y2.
      const axisOptions = userAxis.options;
      if (Object.hasOwn(axisOptions, name)) {
        return axisOptions[name];
      }
      const axisAlias = OPTION_ALIASES[name];
      if (axisAlias && Object.hasOwn(axisOptions, axisAlias)) {
        return axisOptions[axisAlias];
      }
    }

    // User-specified global options second.
    // But, hack, ignore globally-specified 'logscale' for 'x' axis declaration.
    if (!(axis === "x" && name === "logscale")) {
      const result = this.getGlobalUser_(name);
      if (result !== null) {
        return result;
      }
    }
    // Default axis options third.
    if (isDefaultAxisKey(axisString)) {
      const defaultAxisOptions = DEFAULT_ATTRS.axes[axisString];
      if (Object.hasOwn(defaultAxisOptions, name)) {
        return Reflect.get(defaultAxisOptions, name);
      }
    }

    // Default global options last.
    return this.getGlobalDefault_(name);
  }

  /**
   * Get a value for a specific series. If there is no specific value for the series,
   * the value for the axis is returned (and afterwards, the global value.)
   *
   * @param name the name of the option.
   * @param series the series to search.
   */
  getForSeries(name: string, series: string): unknown {
    // Honors indexes as series.
    if (series === this.zpgraph_.getHighlightSeries()) {
      if (Object.hasOwn(this.highlightSeries_, name)) {
        return this.highlightSeries_[name];
      }
    }

    if (!Object.hasOwn(this.series_, series)) {
      throw new Error("Unknown series: " + series);
    }

    const seriesObj = this.series_[series]!;
    const seriesOptions = seriesObj.options;
    if (Object.hasOwn(seriesOptions, name)) {
      return seriesOptions[name];
    }

    return this.getForAxis(name, seriesObj.yAxis);
  }

  /**
   * Returns the number of y-axes on the chart.
   * @return the number of axes.
   */
  numAxes() {
    return this.yAxes_.length;
  }

  /**
   * Return the y-axis for a given series, specified by name.
   */
  axisForSeries(series: string): number {
    return this.series_[series]!.yAxis;
  }

  /**
   * Returns the options for the specified axis.
   */
  axisOptions(yAxis: number): Record<string, unknown> {
    return this.yAxes_[yAxis]!.options;
  }

  /**
   * Return the series associated with an axis.
   */
  seriesForAxis(yAxis: number): string[] {
    return this.yAxes_[yAxis]!.series;
  }

  /**
   * Return the list of all series, in their columnar order.
   */
  seriesNames() {
    return this.labels_;
  }

  /**
   * Validate all options. Runs on every parse; it is a no-op only in a
   * production bundle, where OPTIONS_REFERENCE is tree-shaken away.
   * @private
   */
  validateOptions_() {
    if (!OPTIONS_REFERENCE) {
      return;
    }

    const validateOption = (optionName: string) => {
      if (!OPTIONS_REFERENCE[optionName]) {
        this.warnInvalidOption_(optionName);
      }
    };

    const optionsDicts = [
      this.xAxis_.options,
      this.yAxes_[0]!.options,
      this.yAxes_[1]?.options,
      this.global_,
      this.user_,
      this.highlightSeries_,
    ];
    const names = this.seriesNames();
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      if (Object.hasOwn(this.series_, name)) {
        optionsDicts.push(this.series_[name]!.options);
      }
    }
    for (let i = 0; i < optionsDicts.length; i++) {
      const dict = optionsDicts[i];
      if (!dict) {
        continue;
      }
      for (const optionName in dict) {
        if (Object.hasOwn(dict, optionName)) {
          validateOption(optionName);
        }
      }
    }
  }

  /**
   * Logs a warning about invalid options.
   * @private
   */
  warnInvalidOption_(optionName: string): void {
    if (!WARNINGS[optionName]) {
      WARNINGS[optionName] = true;
      const isSeries = this.labels_.includes(optionName);
      if (isSeries) {
        log.warn(
          "Use per-series options (saw " +
            optionName +
            " as a top-level options key): put it under series[" +
            JSON.stringify(optionName) +
            "] or axes.",
        );
      } else {
        log.warn(
          "Unknown option " +
            optionName +
            " (see the options reference in the README for the full list)",
        );
      }
      throw new Error("invalid option " + optionName);
    }
  }
}

export default OptionsManager;

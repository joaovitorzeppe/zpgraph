"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * @fileoverview Computes the layout of the chart: where every point, tick and
 * annotation lands, in fractions of the plot area.
 */

/*global Zpgraph:false */

import * as utils from "./utils";
import { log } from "./logger";
import type {
  AxisProperties,
  AxisTick,
  LayoutEventPayload,
  LayoutTick,
  LayoutYTick,
  ParsedAnnotation,
  PlotArea,
  XAxisLayoutState,
  ZpgraphInstance,
} from "./internal-types";
import type { Annotation, Point } from "./types";

/**
 * Creates a new ZpgraphLayout object.
 *
 * This class contains all the data to be charted.
 * It uses data coordinates, but also records the chart range (in data
 * coordinates) and hence is able to calculate percentage positions ('In this
 * view, Point A lies 25% down the x-axis.')
 *
 * Despite the name, it does not record pixel coordinates nor decide where
 * chart elements go — that is the renderer's job.
 */
export default class ZpgraphLayout {
  zpgraph_: ZpgraphInstance;
  points: Point[][];
  setNames: string[];
  annotations: ParsedAnnotation[];
  yAxes_: AxisProperties[] | null;
  xTicks_: AxisTick[] | null;
  yTicks_: unknown;
  area_: PlotArea | undefined;
  _xAxis: XAxisLayoutState;
  xticks: LayoutTick[];
  yticks: LayoutYTick[];
  annotated_points: Point[];
  setPointsLengths: number[] | undefined;
  setPointsOffsets: number[] | undefined;

  constructor(zpgraph: ZpgraphInstance) {
    this.zpgraph_ = zpgraph;
    /**
     * Array of points for each series.
     *
     * [series index][row index in series] = |Point| structure,
     * where series index refers to visible series only, and the
     * point index is for the reduced set of points for the current
     * zoom region (including one point just outside the window).
     * All points in the same row index share the same X value.
     *

     */
    this.points = [];
    this.setNames = [];
    this.annotations = [];
    this.yAxes_ = null;

    this.xTicks_ = null;
    this.yTicks_ = null;
    this._xAxis = { minval: 0, maxval: 0, scale: 1 };
    this.xticks = [];
    this.yticks = [];
    this.annotated_points = [];
  }

  /**
   * Add points for a single series.
   *
   * @param setname Name of the series.
   * @param set_xy Points for the series.
   */
  addDataset(setname: string, set_xy: Point[]) {
    this.points.push(set_xy);
    this.setNames.push(setname);
  }

  /**
   * Returns the box which the chart should be drawn in. This is the canvas's
   * box, less space needed for the axis and chart labels.
   *
   *
   */
  getPlotArea(): PlotArea {
    return this.area_ ?? { x: 0, y: 0, w: 0, h: 0 };
  }

  // Compute the box which the chart should be drawn in. This is the canvas's
  // box, less space needed for axis, chart labels, and other plug-ins.
  // NOTE: This should only be called by Zpgraph.predraw_().
  computePlotArea() {
    const area: PlotArea = {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    };

    area.w =
      this.zpgraph_.width_ -
      area.x -
      Number(this.zpgraph_.getOption("rightGap") ?? 0);
    area.h = this.zpgraph_.height_;

    // Let plugins reserve space.
    const e: LayoutEventPayload = {
      chart_div: this.zpgraph_.graphDiv,
      reserveSpaceLeft: (px: number) => {
        const r = {
          x: area.x,
          y: area.y,
          w: px,
          h: area.h,
        };
        area.x += px;
        area.w -= px;
        return r;
      },
      reserveSpaceRight: (px: number) => {
        const r = {
          x: area.x + area.w - px,
          y: area.y,
          w: px,
          h: area.h,
        };
        area.w -= px;
        return r;
      },
      reserveSpaceTop: (px: number) => {
        const r = {
          x: area.x,
          y: area.y,
          w: area.w,
          h: px,
        };
        area.y += px;
        area.h -= px;
        return r;
      },
      reserveSpaceBottom: (px: number) => {
        const r = {
          x: area.x,
          y: area.y + area.h - px,
          w: area.w,
          h: px,
        };
        area.h -= px;
        return r;
      },
      chartRect: () => ({ x: area.x, y: area.y, w: area.w, h: area.h }),
    };
    this.zpgraph_.cascadeEvents_("layout", {
      chart_div: e.chart_div,
      reserveSpaceLeft: e.reserveSpaceLeft,
      reserveSpaceRight: e.reserveSpaceRight,
      reserveSpaceTop: e.reserveSpaceTop,
      reserveSpaceBottom: e.reserveSpaceBottom,
      chartRect: e.chartRect,
    });

    this.area_ = area;
  }

  setAnnotations(ann: Array<Annotation & { xval?: number | null }>) {
    // The Zpgraph object's annotations aren't parsed. We parse them here and
    // save a copy. If there is no parser, then the user must be using raw format.
    this.annotations = [];
    const parserOpt = this.zpgraph_.getFunctionOption("xValueParser");
    const parse = (x: string | number | Date): number => {
      if (parserOpt) {
        const parsed = parserOpt(x);
        return typeof parsed === "number" ? parsed : Number(parsed);
      }
      if (typeof x === "number") {
        return x;
      }
      if (x instanceof Date) {
        return x.getTime();
      }
      return Number(x);
    };
    for (let i = 0; i < ann.length; i++) {
      const a: ParsedAnnotation = { series: "", x: 0 };
      const src = ann[i]!;
      // An invalid annotation is skipped, not fatal: dropping the rest of the
      // list because of one bad entry hides the good ones.
      if (!src.xval && src.x === undefined) {
        log.error(
          "Ignoring annotation " +
            i +
            ": annotations must have an 'x' property",
        );
        continue;
      }
      if (typeof src.series !== "string") {
        log.error("Ignoring annotation " + i + ": 'series' must name a series");
        continue;
      }
      if (
        src.icon &&
        !(Object.hasOwn(src, "width") && Object.hasOwn(src, "height"))
      ) {
        log.error(
          "Ignoring annotation " +
            i +
            ": must set width and height when " +
            "setting annotation.icon property",
        );
        continue;
      }
      utils.update(a, src);
      if (!a.xval) {
        a.xval = parse(a.x);
      }
      this.annotations.push(a);
    }
  }

  setXTicks(xTicks: AxisTick[]) {
    this.xTicks_ = xTicks;
  }

  setYAxes(yAxes: AxisProperties[]) {
    this.yAxes_ = yAxes;
  }

  evaluate() {
    this._xAxis = { minval: 0, maxval: 0, scale: 1 };
    this._evaluateLimits();
    this._evaluateLineCharts();
    this._evaluateLineTicks();
    this._evaluateAnnotations();
  }

  _evaluateLimits() {
    const xlimits = this.zpgraph_.xAxisRange();
    this._xAxis.minval = xlimits[0];
    this._xAxis.maxval = xlimits[1];
    const xrange = xlimits[1] - xlimits[0];
    this._xAxis.scale = xrange !== 0 ? 1 / xrange : 1.0;

    if (this.zpgraph_.getOptionForAxis("logscale", "x")) {
      this._xAxis.xlogrange =
        utils.log10(this._xAxis.maxval) - utils.log10(this._xAxis.minval);
      this._xAxis.xlogscale =
        this._xAxis.xlogrange !== 0 ? 1.0 / this._xAxis.xlogrange : 1.0;
    }
    const yAxes = this.yAxes_!;
    for (let i = 0; i < yAxes.length; i++) {
      const axis = yAxes[i]!;
      const computed = axis.computedValueRange!;
      axis.minyval = computed[0];
      axis.maxyval = computed[1];
      axis.yrange = axis.maxyval - axis.minyval;
      axis.yscale = axis.yrange !== 0 ? 1.0 / axis.yrange : 1.0;

      if (this.zpgraph_.getOption("logscale") || axis.logscale) {
        axis.ylogrange = utils.log10(axis.maxyval) - utils.log10(axis.minyval);
        axis.ylogscale = axis.ylogrange !== 0 ? 1.0 / axis.ylogrange : 1.0;
        if (!isFinite(axis.ylogrange) || isNaN(axis.ylogrange)) {
          log.error(
            "axis " +
              i +
              " of graph at " +
              axis.g +
              " can't be displayed in log scale for range [" +
              axis.minyval +
              " - " +
              axis.maxyval +
              "]",
          );
        }
      }
    }
  }

  static calcXNormal_(
    value: number | null | undefined,
    xAxis: XAxisLayoutState,
    logscale: boolean,
  ) {
    if (logscale) {
      if (typeof value !== "number" || typeof xAxis.xlogscale !== "number") {
        return NaN;
      }
      return (
        (utils.log10(value) - utils.log10(xAxis.minval)) * xAxis.xlogscale
      );
    }
    return (value! - xAxis.minval) * xAxis.scale;
  }

  /**
   * @param axis
   * @param value
   * @param logscale
   * @return */
  static calcYNormal_(
    axis: AxisProperties,
    value: number | null | undefined,
    logscale: boolean,
  ) {
    if (logscale) {
      if (typeof value !== "number") {
        return NaN;
      }
      const x =
        1.0 -
        (utils.log10(value) - utils.log10(axis.minyval!)) * axis.ylogscale!;
      return isFinite(x) ? x : NaN; // shim for v8 issue; see pull request 276
    }
    return 1.0 - (value! - axis.minyval!) * axis.yscale!;
  }

  _evaluateLineCharts() {
    const isStacked = this.zpgraph_.getOption("stackedGraph");
    const isLogscaleForX = this.zpgraph_.getOptionForAxis("logscale", "x");

    for (let setIdx = 0; setIdx < this.points.length; setIdx++) {
      const points = this.points[setIdx]!;
      const setName = this.setNames[setIdx]!;
      const connectSeparated = this.zpgraph_.getOption(
        "connectSeparatedPoints",
        setName,
      );
      const axis = this.zpgraph_.axisPropertiesForSeries(setName);
      const logscale = Boolean(
        this.zpgraph_.attributes_.getForSeries("logscale", setName),
      );
      let outOfXBounds = 0,
        outOfYBounds = 0;

      for (let j = 0; j < points.length; j++) {
        const point = points[j]!;

        // Range from 0-1 where 0 represents left and 1 represents right.
        point.x = ZpgraphLayout.calcXNormal_(
          point.xval,
          this._xAxis,
          Boolean(isLogscaleForX),
        );
        outOfXBounds += +(point.x < 0 || point.x > 1);
        // Range from 0-1 where 0 represents top and 1 represents bottom
        let yval = point.yval;
        if (isStacked) {
          point.y_stacked = ZpgraphLayout.calcYNormal_(
            axis,
            point.yval_stacked ?? null,
            logscale,
          );
          if (yval != null && !isNaN(yval)) {
            yval = point.yval_stacked ?? null;
          }
        }
        if (yval === null) {
          yval = NaN;
          if (!connectSeparated) {
            point.yval = NaN;
          }
        }
        point.y = ZpgraphLayout.calcYNormal_(axis, yval, logscale);
        outOfYBounds += +(point.y < 0 || point.y > 1);
      }

      if (outOfXBounds > 2) {
        log.warn(
          outOfXBounds +
            " points out of X bounds:" +
            this._xAxis.minval +
            " - " +
            this._xAxis.maxval,
        );
      }
      if (outOfYBounds > 0) {
        log.warn(
          outOfYBounds +
            " points out of Y bounds:" +
            axis.minyval +
            " - " +
            axis.maxyval,
        );
      }

      this.zpgraph_.dataHandler_.onLineEvaluated(points, axis, logscale);
    }
  }

  _evaluateLineTicks() {
    let i, tick, label, pos, v, has_tick;
    this.xticks = [];
    const xTicks = this.xTicks_!;
    for (i = 0; i < xTicks.length; i++) {
      tick = xTicks[i]!;
      label = tick.label;
      has_tick = !("label_v" in tick);
      v = has_tick ? tick.v : tick.label_v!;
      pos = this.zpgraph_.toPercentXCoord(v);
      if (pos !== null && pos >= 0.0 && pos < 1.0) {
        this.xticks.push({ pos, label, has_tick });
      }
    }

    this.yticks = [];
    const yAxes = this.yAxes_!;
    for (i = 0; i < yAxes.length; i++) {
      const axis = yAxes[i]!;
      const ticks = axis.ticks!;
      for (let j = 0; j < ticks.length; j++) {
        tick = ticks[j]!;
        label = tick.label;
        has_tick = !("label_v" in tick);
        v = has_tick ? tick.v : tick.label_v!;
        pos = this.zpgraph_.toPercentYCoord(v, i);
        if (pos !== null && pos > 0.0 && pos <= 1.0) {
          this.yticks.push({ axis: i, pos, label, has_tick });
        }
      }
    }
  }

  _evaluateAnnotations() {
    // Add the annotations to the point to which they belong.
    // Make a map from (setName, xval) to annotation for quick lookups.
    let i;
    const annotations: Record<string, ParsedAnnotation> = {};
    for (i = 0; i < this.annotations.length; i++) {
      const a = this.annotations[i]!;
      annotations[a.xval + "," + a.series] = a;
    }

    this.annotated_points = [];

    // Exit the function early if there are no annotations.
    if (!this.annotations?.length) {
      return;
    }

    for (let setIdx = 0; setIdx < this.points.length; setIdx++) {
      const points = this.points[setIdx]!;
      for (i = 0; i < points.length; i++) {
        const p = points[i]!;
        const k = p.xval + "," + p.name;
        const matched = annotations[k];
        if (matched) {
          (p as Point & { annotation?: ParsedAnnotation }).annotation = matched;
          this.annotated_points.push(p);
          //if there are multiple same x-valued points, the annotation would be rendered multiple times
          //remove already rendered annotation
          delete annotations[k];
        }
      }
    }
  }

  /**
   * Convenience function to remove all the data sets from a graph
   */
  removeAllDatasets() {
    this.points = [];
    this.setNames = [];
    this.setPointsLengths = [];
    this.setPointsOffsets = [];
  }
}

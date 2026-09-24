/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * The draw pipeline. predraw runs once per data or option change and derives
 * everything that does not depend on the viewport; drawGraph runs on every pan,
 * zoom and resize and only turns the visible slice into points and pixels.
 */

import ZpgraphCanvasRenderer from "./canvas";
import { xAxisExtremes } from "./coords";
import { decimatePointsByX } from "./decimate";
import { log } from "./logger";
import { updateAriaLabel } from "./dom";
import * as utils from "./utils";
import type { Point, Ticker } from "./types";
import type { AxisProperties, UnifiedSeries } from "./internal-types";
import type Zpgraph from "./zpgraph";

type SeriesExtremes = [number | null, number | null];
type GatheredExtremes = Record<string, SeriesExtremes>;

/**
 * @private
 * This function is called once when the chart's data is changed or the options
 * dictionary is updated. It is _not_ called when the user pans or zooms. The
 * idea is that values derived from the chart's data can be computed here,
 * rather than every time the chart is drawn. This includes things like the
 * number of axes, rolling averages, etc.
 */
export const predraw = (g: Zpgraph) => {
  const start = new Date();

  // Create the correct dataHandler
  g.dataHandler_ = new (g.getHandlerClass_())();

  g.layout_.computePlotArea();

  computeYAxes(g);

  if (!g.is_initial_draw_) {
    g.canvas_ctx_.restore();
    g.hidden_ctx_.restore();
  }

  g.canvas_ctx_.save();
  g.hidden_ctx_.save();

  if (g.plotter_) {
    g.plotter_.bindFrame(g.hidden_, g.hidden_ctx_, g.layout_);
  } else {
    g.plotter_ = new ZpgraphCanvasRenderer(
      g,
      g.hidden_,
      g.hidden_ctx_,
      g.layout_,
    );
  }

  g.cascadeEvents_("predraw");

  // Convert the raw data (a 2D array) into the internal format and compute
  // rolling averages.
  g.rolledSeries_ = [null]; // x-axis is the first series and it's special
  for (let i = 1; i < g.numColumns(); i++) {
    let series = g.dataHandler_.extractSeries(g.rawData_, i, g.attributes_);
    if (g.rollPeriod_ > 1) {
      series = g.dataHandler_.rollingAverage(
        series,
        g.rollPeriod_,
        g.attributes_,
        i,
      );
    }

    g.rolledSeries_.push(series);
  }

  // If the data or options have changed, then we'd better redraw.
  drawGraph(g);

  // This is used to determine whether to do various animations.
  const end = new Date();
  g.drawingTimeMs_ = end.getTime() - start.getTime();
};

/**
 * Calculates point stacking for stackedGraph=true.
 *
 * For stacking purposes, interpolate or extend neighboring data across
 * NaN values based on stackedGraphNaNFill settings. This is for display
 * only, the underlying data value as shown in the legend remains NaN.
 *
 * @param points Point array for a single series.
 *     Updates each Point's yval_stacked property.
 * @param cumulativeYval Accumulated top-of-graph stacked Y
 *     values for the series seen so far. Index is the row number. Updated
 *     based on the current series's values.
 * @param seriesExtremes Min and max values, updated
 *     to reflect the stacked values.
 * @param fillMethod Interpolation method, one of 'all', 'inside', or
 *     'none'.
 * @private
 */
export const stackPoints = (
  points: Point[],
  cumulativeYval: Record<number, number>,
  seriesExtremes: SeriesExtremes,
  fillMethod: unknown,
) => {
  let lastXval: number | null = null;
  let prevPoint: Point | null = null;
  let nextPointIdx = -1;
  let cachedNextPoint: Point | null = null;

  // Find the next stackable point starting from the given index.
  const findNextPoint = (idx: number): Point | null => {
    // If we've previously found a non-NaN point and haven't gone past it yet,
    // just use that.
    if (nextPointIdx >= idx) {
      return cachedNextPoint;
    }

    // We haven't found a non-NaN point yet or have moved past it,
    // look towards the right to find a non-NaN point.
    cachedNextPoint = null;
    for (let j = idx; j < points.length; ++j) {
      const candidate = points[j]!;
      if (!isNaN(Number(candidate.yval)) && candidate.yval !== null) {
        nextPointIdx = j;
        cachedNextPoint = candidate;
        return candidate;
      }
    }
    return null;
  };

  for (let i = 0; i < points.length; ++i) {
    const point = points[i]!;
    const xval = point.xval;
    if (xval == null) {
      continue;
    }
    if (cumulativeYval[xval] === undefined) {
      cumulativeYval[xval] = 0;
    }

    let actualYval = point.yval;
    const fill = String(fillMethod);
    if (isNaN(Number(actualYval)) || actualYval === null) {
      if (fill === "none") {
        actualYval = 0;
      } else {
        // Interpolate/extend for stacking purposes if possible.
        const nextPoint = findNextPoint(i);
        if (prevPoint !== null && nextPoint !== null) {
          // Use linear interpolation between prevPoint and nextPoint.
          actualYval =
            prevPoint.yval! +
            (nextPoint.yval! - prevPoint.yval!) *
              ((xval - prevPoint.xval!) / (nextPoint.xval! - prevPoint.xval!));
        } else if (prevPoint !== null && fill === "all") {
          actualYval = prevPoint.yval ?? 0;
        } else if (nextPoint !== null && fill === "all") {
          actualYval = nextPoint.yval ?? 0;
        } else {
          actualYval = 0;
        }
      }
    } else {
      prevPoint = point;
    }

    const yContribution = Number(actualYval) || 0;
    let stackedYval = cumulativeYval[xval];
    if (lastXval !== xval) {
      // If an x-value is repeated, we ignore the duplicates.
      stackedYval += yContribution;
      cumulativeYval[xval] = stackedYval;
    }
    lastXval = xval;

    point.yval_stacked = stackedYval;

    if (stackedYval > seriesExtremes[1]!) {
      seriesExtremes[1] = stackedYval;
    }
    if (stackedYval < seriesExtremes[0]!) {
      seriesExtremes[0] = stackedYval;
    }
  }
};

/**
 * Loop over all fields and create datasets, calculating extreme y-values for
 * each series and extreme x-indices as we go.
 *
 * dateWindow is passed in as an explicit parameter so that we can compute
 * extreme values "speculatively", i.e. without actually setting state on the
 * zpgraph.
 *
 * @param rolledSeries, where
 *     rolledSeries[seriesIndex][row] = raw point, where
 *     seriesIndex is the column number starting with 1, and
 *     rawPoint is [x,y] or [x, [y, err]] or [x, [y, yminus, yplus]].
 * @param dateWindow [xmin, xmax] pair, or null.
 *
 * @private
 */
export const gatherDatasets = (
  g: Zpgraph,
  rolledSeries: Array<UnifiedSeries | null>,
  dateWindow: [number, number] | null,
) => {
  const boundaryIds: Array<[number, number] | null> = [];
  const points: Point[][] = [];
  const cumulativeYval: Record<number, number>[] = []; // For stacked series.
  const extremes: GatheredExtremes = {}; // series name -> [low, high]
  let seriesIdx: number;
  let firstIdx: number | null;
  let lastIdx: number | null;
  let axisIdx: number;

  // Loop over the fields (series).  Go from the last to the first,
  // because if they're stacked that's how we accumulate the values.
  const num_series = rolledSeries.length - 1;
  let series: UnifiedSeries;
  for (seriesIdx = num_series; seriesIdx >= 1; seriesIdx--) {
    if (!g.visibility()[seriesIdx - 1]) {
      continue;
    }

    // Prune down to the desired range, if necessary (for zooming)
    // Because there can be lines going to points outside of the visible area,
    // we actually prune to visible points, plus one on either side.
    if (dateWindow) {
      series = rolledSeries[seriesIdx]!;
      const low = dateWindow[0];
      const high = dateWindow[1];

      // Series are sorted by x, so the window boundaries are a binary
      // search. The linear scan this replaces ran over every sample of
      // every series on every frame of a pan.
      firstIdx = utils.lowerBoundX(series, low);
      if (firstIdx === series.length) {
        firstIdx = null;
      }
      lastIdx = utils.upperBoundX(series, high);
      if (lastIdx < 0) {
        lastIdx = null;
      }

      if (firstIdx === null) {
        firstIdx = 0;
      }
      let correctedFirstIdx = firstIdx;
      let isInvalidValue = true;
      while (isInvalidValue && correctedFirstIdx > 0) {
        correctedFirstIdx--;
        // check if the y value is null.
        isInvalidValue = series[correctedFirstIdx]![1] === null;
      }

      if (lastIdx === null) {
        lastIdx = series.length - 1;
      }
      let correctedLastIdx = lastIdx;
      isInvalidValue = true;
      while (isInvalidValue && correctedLastIdx < series.length - 1) {
        correctedLastIdx++;
        isInvalidValue = series[correctedLastIdx]![1] === null;
      }

      if (correctedFirstIdx !== firstIdx) {
        firstIdx = correctedFirstIdx;
      }
      if (correctedLastIdx !== lastIdx) {
        lastIdx = correctedLastIdx;
      }

      boundaryIds[seriesIdx - 1] = [firstIdx, lastIdx];

      // .slice's end is exclusive, we want to include lastIdx.
      series = series.slice(firstIdx, lastIdx + 1);
    } else {
      series = rolledSeries[seriesIdx]!;
      boundaryIds[seriesIdx - 1] = [0, series.length - 1];
    }

    const seriesNameRaw = g.getLabels()?.[seriesIdx];
    const seriesName =
      typeof seriesNameRaw === "string" ? seriesNameRaw : "";
    const seriesExtremes = g.dataHandler_.getExtremeYValues(
      series,
      dateWindow,
      g.getBooleanOption("stepPlot", seriesName),
    );

    const seriesPoints = g.dataHandler_.seriesToPoints(
      series,
      seriesName,
      boundaryIds[seriesIdx - 1]![0],
    );

    if (g.getBooleanOption("stackedGraph")) {
      axisIdx = g.attributes_.axisForSeries(seriesName);
      if (cumulativeYval[axisIdx] === undefined) {
        cumulativeYval[axisIdx] = {};
      }
      stackPoints(
        seriesPoints,
        cumulativeYval[axisIdx]!,
        seriesExtremes,
        g.getStringOption("stackedGraphNaNFill"),
      );
    }

    extremes[seriesName] = seriesExtremes;
    points[seriesIdx] = seriesPoints;
  }

  return { points: points, extremes: extremes, boundaryIds: boundaryIds };
};

/**
 * Update the graph with new data. This method is called when the viewing area
 * has changed. If the underlying data or options have changed, predraw_ will
 * be called before drawGraph_ is called.
 *
 * @private
 */
export const drawGraph = (g: Zpgraph) => {
  const start = new Date();

  // This is used to set the second parameter to drawCallback, below.
  const is_initial_draw = g.is_initial_draw_;
  g.is_initial_draw_ = false;

  g.layout_.removeAllDatasets();
  g.setColors_();
  g.attrs_.pointSize = 0.5 * g.getNumericOption("highlightCircleSize");

  const packed = gatherDatasets(g, g.rolledSeries_, g.dateWindow_);
  const points = packed.points;
  const extremes = packed.extremes;
  const boundaryIds: Array<[number, number]> = [];
  for (let i = 0; i < packed.boundaryIds.length; i++) {
    const b = packed.boundaryIds[i];
    if (b) {
      boundaryIds[i] = b;
    }
  }
  g.boundaryIds_ = boundaryIds;

  const pixelWidth = g.plotter_?.area?.w || g.width_;
  const [xMin, xMax] = g.dateWindow_ ?? xAxisExtremes(g);
  for (let i = 1; i < points.length; i++) {
    if (!g.visibility()[i - 1]) {
      continue;
    }
    const seriesPoints = points[i];
    if (seriesPoints?.length) {
      points[i] = decimatePointsByX(seriesPoints, xMin, xMax, pixelWidth);
    }
  }

  g.setIndexByName_ = {};
  const labels = g.getLabels() ?? [];
  let dataIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (!g.visibility()[i - 1]) {
      continue;
    }
    const label = labels[i];
    const seriesPoints = points[i];
    if (typeof label !== "string" || !seriesPoints) {
      continue;
    }
    g.layout_.addDataset(label, seriesPoints);
    g.datasetIndex_[i] = dataIdx++;
  }
  g.setIndexByName_ = Object.fromEntries(labels.map((label, i) => [label, i]));

  computeYAxisRanges(g, extremes);
  g.layout_.setYAxes(g.axes_);

  g.addXTicks_();

  // Hand the new data to the layout and render it
  g.layout_.evaluate();
  renderGraph(g, is_initial_draw);

  if (g.getStringOption("timingName")) {
    const end = new Date();
    log.log(
      g.getStringOption("timingName") +
        " - drawGraph: " +
        (end.getTime() - start.getTime()) +
        "ms",
    );
  }
};

/**
 * This does the work of drawing the chart. It assumes that the layout and axis
 * scales have already been set (e.g. by predraw_).
 *
 * @private
 */
export const renderGraph = (g: Zpgraph, is_initial_draw: boolean) => {
  g.cascadeEvents_("clearChart");
  g.plotter_.clear();

  const underlayCallback = g.getFunctionOption("underlayCallback");
  if (underlayCallback) {
    // NOTE: we pass the zpgraph object to this callback twice to avoid breaking
    // users who expect a deprecated form of this callback.
    underlayCallback(g.hidden_ctx_, g.layout_.getPlotArea(), g);
  }

  const e = {
    canvas: g.hidden_,
    drawingContext: g.hidden_ctx_,
  };
  g.cascadeEvents_("willDrawChart", e);
  g.plotter_.render();
  g.cascadeEvents_("didDrawChart", e);
  // The description has to follow the picture: a zoom changes what is shown.
  updateAriaLabel(g);
  g.lastRow_ = -1; // because plugins/legend.js clears the legend

  // The interaction canvas should already be empty in that situation.
  g.canvas_ctx_.clearRect(0, 0, g.width_, g.height_);

  const drawCallback = g.getFunctionOption("drawCallback");
  if (drawCallback) {
    drawCallback(g, is_initial_draw);
  }
  if (is_initial_draw) {
    g.readyFired_ = true;
    while (g.readyFns_.length > 0) {
      g.readyFns_.pop()!(g);
    }
  }
};

/**
 * @private
 * Determine properties of the y-axes which are independent of the data
 * currently being displayed. This includes things like the number of axes and
 * the style of the axes. It does not include the range of each axis and its
 * tick marks.
 * This fills in g.axes_.
 * axes_ = [ { options } ]
 *   indices are into the axes_ array.
 */
export const computeYAxes = (g: Zpgraph) => {
  let axis: number;
  let opts: AxisProperties;
  let v: unknown;

  // g.axes_ doesn't match g.attributes_.axes_.options. It's used for
  // data computation as well as options storage.
  // Go through once and add all the axes.
  g.axes_ = [];

  for (axis = 0; axis < g.attributes_.numAxes(); axis++) {
    // Add a new axis, making a copy of its per-axis options.
    opts = { g };
    utils.update(opts, g.attributes_.axisOptions(axis));
    g.axes_[axis] = opts;
  }

  for (axis = 0; axis < g.axes_.length; axis++) {
    if (axis === 0) {
      const axisOpts = g.optionsViewForAxis_("y" + (axis ? "2" : ""));
      v = axisOpts("valueRange");
      if (isValueRange(v)) {
        g.axes_[axis]!.valueRange = v;
      }
    } else {
      // To keep old behavior
      const axes = g.user_attrs_.axes;
      if (axes?.y2) {
        v = axes.y2.valueRange;
        if (isValueRange(v)) {
          g.axes_[axis]!.valueRange = v;
        }
      }
    }
  }
};

const isValueRange = (
  v: unknown,
): v is [number | null, number | null] =>
  Array.isArray(v) &&
  v.length === 2 &&
  (typeof v[0] === "number" || v[0] === null) &&
  (typeof v[1] === "number" || v[1] === null);

const isTicker = (v: unknown): v is Ticker => typeof v === "function";
/**
 * @private
 * Determine the value range and tick marks for each axis.
 * @param extremes A mapping from seriesName -> [low, high]
 * This fills in the valueRange and ticks fields in each entry of g.axes_.
 */
export const computeYAxisRanges = (g: Zpgraph, extremes: GatheredExtremes) => {
  const numAxes = g.attributes_.numAxes();
  let ypadCompat, span, series, ypad;

  let p_axis;

  // Compute extreme values, a span and tick marks for each axis.
  for (let i = 0; i < numAxes; i++) {
    const axis = g.axes_[i]!;
    const logscale = g.attributes_.getForAxis("logscale", i);
    const includeZero = g.attributes_.getForAxis("includeZero", i);
    const independentTicks = g.attributes_.getForAxis("independentTicks", i);
    series = g.attributes_.seriesForAxis(i);

    // Add some padding. This supports two Y padding operation modes:
    //
    // - backwards compatible (yRangePad not set):
    //   10% padding for automatic Y ranges, but not for user-supplied
    //   ranges, and move a close-to-zero edge to zero, since drawing at the edge
    //   results in invisible lines. Unfortunately lines drawn at the edge of a
    //   user-supplied range will still be invisible. If logscale is
    //   set, add a variable amount of padding at the top but
    //   none at the bottom.
    //
    // - new-style (yRangePad set by the user):
    //   always add the specified Y padding.
    //
    ypadCompat = true;
    ypad = 0.1; // add 10%
    const yRangePad = g.getNumericOption("yRangePad");
    if (yRangePad !== null) {
      ypadCompat = false;
      // Convert pixel padding to ratio
      ypad = yRangePad / g.plotter_.area.h;
    }

    if (series.length === 0) {
      // If no series are defined or visible then use a reasonable default
      axis.extremeRange = [0, 1];
    } else {
      // Calculate the extremes of extremes.
      let minY = Infinity; // extremes[series[0]][0];
      let maxY = -Infinity; // extremes[series[0]][1];
      let extremeMinY, extremeMaxY;

      for (let j = 0; j < series.length; j++) {
        // this skips invisible series
        const seriesName = series[j];
        if (!seriesName || !Object.hasOwn(extremes, seriesName)) {
          continue;
        }

        // Only use valid extremes to stop null data series' from corrupting the scale.
        extremeMinY = extremes[seriesName]![0];
        if (extremeMinY !== null) {
          minY = Math.min(extremeMinY, minY);
        }
        extremeMaxY = extremes[seriesName]![1];
        if (extremeMaxY !== null) {
          maxY = Math.max(extremeMaxY, maxY);
        }
      }

      // Include zero if requested by the user.
      if (includeZero && !logscale) {
        if (minY > 0) {
          minY = 0;
        }
        if (maxY < 0) {
          maxY = 0;
        }
      }

      // Ensure we have a valid scale, otherwise default to [0, 1] for safety.
      if (minY === Infinity) {
        minY = 0;
      }
      if (maxY === -Infinity) {
        maxY = 1;
      }

      span = maxY - minY;
      // special case: if we have no sense of scale, center on the sole value.
      if (span === 0) {
        if (maxY !== 0) {
          span = Math.abs(maxY);
        } else {
          // ... and if the sole value is zero, use range 0-1.
          maxY = 1;
          span = 1;
        }
      }

      let maxAxisY = maxY,
        minAxisY = minY;
      if (ypadCompat) {
        if (logscale) {
          maxAxisY = maxY + ypad * span;
          minAxisY = minY;
        } else {
          maxAxisY = maxY + ypad * span;
          minAxisY = minY - ypad * span;

          // Backwards-compatible behavior: Move the span to start or end at zero if it's
          // close to zero.
          if (minAxisY < 0 && minY >= 0) {
            minAxisY = 0;
          }
          if (maxAxisY > 0 && maxY <= 0) {
            maxAxisY = 0;
          }
        }
      }
      axis.extremeRange = [minAxisY, maxAxisY];
    }
    if (axis.valueRange) {
      // This is a user-set value range for this axis.
      const y0 = utils.isNullUndefinedOrNaN(axis.valueRange[0])
        ? axis.extremeRange[0]
        : axis.valueRange[0];
      const y1 = utils.isNullUndefinedOrNaN(axis.valueRange[1])
        ? axis.extremeRange[1]
        : axis.valueRange[1];
      axis.computedValueRange = [y0!, y1!];
    } else {
      axis.computedValueRange = axis.extremeRange!;
    }
    if (!ypadCompat) {
      // When using yRangePad, adjust the upper/lower bounds to add
      // padding unless the user has zoomed/panned the Y axis range.

      let y0 = axis.computedValueRange[0];
      let y1 = axis.computedValueRange[1];

      // special case #781: if we have no sense of scale, center on the sole value.
      if (y0 === y1) {
        if (y0 === 0) {
          y1 = 1;
        } else {
          const delta = Math.abs(y0 / 10);
          y0 -= delta;
          y1 += delta;
        }
      }

      if (logscale) {
        const y0pct = ypad / (2 * ypad - 1);
        const y1pct = (ypad - 1) / (2 * ypad - 1);
        axis.computedValueRange[0] = utils.logRangeFraction(y0, y1, y0pct);
        axis.computedValueRange[1] = utils.logRangeFraction(y0, y1, y1pct);
      } else {
        span = y1 - y0;
        axis.computedValueRange[0] = y0 - span * ypad;
        axis.computedValueRange[1] = y1 + span * ypad;
      }
    }

    if (independentTicks) {
      axis.independentTicks = !!independentTicks;
      const axisOpts = g.optionsViewForAxis_("y" + (i ? "2" : ""));
      const tickerOpt = axisOpts("ticker");
      if (!isTicker(tickerOpt)) {
        throw new Error("y-axis ticker option must be a function");
      }
      axis.ticks = tickerOpt(
        axis.computedValueRange[0],
        axis.computedValueRange[1],
        g.plotter_.area.h,
        axisOpts,
        g,
      );
      // Define the first independent axis as primary axis.
      if (!p_axis) {
        p_axis = axis;
      }
    }
  }
  if (p_axis === undefined) {
    throw new Error(
      'Configuration Error: At least one axis has to have the "independentTicks" option activated.',
    );
  }
  // Add ticks. By default, all axes inherit the tick positions of the
  // primary axis. However, if an axis is specifically marked as having
  // independent ticks, then that is permissible as well.
  for (let i = 0; i < numAxes; i++) {
    const axis = g.axes_[i]!;

    if (!axis.independentTicks) {
      const axisOpts = g.optionsViewForAxis_("y" + (i ? "2" : ""));
      const tickerOpt = axisOpts("ticker");
      if (!isTicker(tickerOpt)) {
        throw new Error("y-axis ticker option must be a function");
      }
      const p_ticks = p_axis.ticks!;
      const p_range = p_axis.computedValueRange!;
      const p_scale = p_range[1] - p_range[0];
      const range = axis.computedValueRange!;
      const scale = range[1] - range[0];
      const tick_values: number[] = [];
      for (let k = 0; k < p_ticks.length; k++) {
        const y_frac = (p_ticks[k]!.v - p_range[0]) / p_scale;
        const y_val = range[0] + y_frac * scale;
        tick_values.push(y_val);
      }

      axis.ticks = tickerOpt(
        range[0],
        range[1],
        g.plotter_.area.h,
        axisOpts,
        g,
        tick_values,
      );
    }
  }
};

/**
 * Returns the lower- and upper-bound y-axis values for each axis. These are
 * the ranges you'll get if you double-click to zoom out or call resetZoom().
 * The return value is an array of [low, high] tuples, one for each y-axis.
 */
export const yAxisExtremes = (g: Zpgraph) => {
  const packed = gatherDatasets(g, g.rolledSeries_, null);
  const { extremes } = packed;
  const saveAxes = g.axes_;
  computeYAxisRanges(g, extremes);
  const newAxes = g.axes_;
  g.axes_ = saveAxes;
  return newAxes.map((axis) => axis.extremeRange!);
};

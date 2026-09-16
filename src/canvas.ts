'use strict';

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * @fileoverview Renders the chart onto the canvas.
 *
 * In particular, support for:
 * - grid overlays
 * - high/low bands
 * - zgraph attribute system
 */

/**
 * The ZgraphCanvasRenderer class does the actual rendering of the chart onto
 * a canvas.
 * @param element The canvas to attach to
 * @param elementContext The 2d context of the canvas (injected so it
 * can be mocked for testing.)
 * @param layout The ZgraphLayout object for this graph.
 * @constructor
 */

/*global Zgraph:false */

import * as utils from './utils';
import { DECIMATION_THRESHOLD, type DecimatedPoints } from './decimate';
import { log } from './logger';
import type { DrawPointCallback, Plotter, PlotterEvent, Point } from './types';
import type {
  AxisProperties,
  LayoutLike,
  PlotArea,
  ZgraphInstance,
} from './internal-types';

/** Plotter payload used by canvas renderers (extends public PlotterEvent). */
type CanvasPlotterEvent = Omit<PlotterEvent, 'zgraph' | 'axis' | 'plotArea'> & {
  zgraph: ZgraphInstance;
  axis: AxisProperties;
  plotArea: PlotArea;
  singleSeriesName?: string | null;
  allSeriesPoints?: Point[][];
};

type IteratorPredicateFn = (array: unknown[], idx: number) => boolean;
type PointOnLine = [canvasx: number, canvasy: number, idx: number];
type CanvasAction = [type: number, x: number, y: number];

interface FastCanvasProxy {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  beginPath(): void;
  closePath(): void;
  _count(): number;
}

type FillContext = CanvasRenderingContext2D | FastCanvasProxy;

/**
 * @constructor
 *
 * This gets called when there are "new points" to chart. This is generally the
 * case when the underlying data being charted has changed. It is _not_ called
 * in the common case that the user has zoomed or is panning the view.
 *
 * The chart canvas has already been created by the Zgraph object. The
 * renderer simply gets a drawing context.
 *
 * @param zgraph The chart to which this renderer belongs.
 * @param element The &lt;canvas&gt; DOM element on which to draw.
 * @param elementContext The drawing context.
 * @param layout The chart's ZgraphLayout object.
 */
export default class ZgraphCanvasRenderer {
  zgraph_: ZgraphInstance;
  layout: LayoutLike;
  element: HTMLCanvasElement;
  elementContext: CanvasRenderingContext2D;
  height: number;
  width: number;
  area: PlotArea;
  colors!: Record<string, string>;

  constructor(
    zgraph: ZgraphInstance,
    element: HTMLCanvasElement,
    elementContext: CanvasRenderingContext2D,
    layout: LayoutLike,
  ) {
    this.zgraph_ = zgraph;

    this.layout = layout;
    this.element = element;
    this.elementContext = elementContext;

    this.height = zgraph.height_;
    this.width = zgraph.width_;

    // internal state
    this.area = layout.getPlotArea();

    // Set up a clipping area for the canvas (and the interaction canvas).
    // This ensures that we don't overdraw.
    let ctx = this.zgraph_.canvas_ctx_;
    ctx.beginPath();
    ctx.rect(this.area.x, this.area.y, this.area.w, this.area.h);
    ctx.clip();

    ctx = this.zgraph_.hidden_ctx_;
    ctx.beginPath();
    ctx.rect(this.area.x, this.area.y, this.area.w, this.area.h);
    ctx.clip();
  }

  /**
   * Clears out all chart content and DOM elements.
   * This is called immediately before render() on every frame, including
   * during zooms and pans.
   * @private
   */
  clear() {
    this.elementContext.clearRect(0, 0, this.width, this.height);
  }

  /**
   * This method is responsible for drawing everything on the chart, including
   * lines, high/low bands, fills and axes.
   * It is called immediately after clear() on every frame, including during pans
   * and zooms.
   * @private
   */
  render() {
    // attaches point.canvas{x,y}
    this._updatePoints();

    // actually draws the chart.
    this._renderLineChart();
  }

  /**
   * Returns a predicate to be used with an iterator, which will
   * iterate over points appropriately, depending on whether
   * connectSeparatedPoints is true. When it's false, the predicate will
   * skip over points with missing yVals.
   */
  static _getIteratorPredicate(
    connectSeparatedPoints: boolean,
  ): IteratorPredicateFn | null {
    return connectSeparatedPoints
      ? ZgraphCanvasRenderer._predicateThatSkipsEmptyPoints
      : null;
  }

  static _predicateThatSkipsEmptyPoints(array: unknown[], idx: number) {
    return (array[idx] as Point).yval !== null;
  }

  /**
   * Draws a line with the styles passed in and calls all the drawPointCallbacks.
   * @param e The dictionary passed to the plotter function.
   * @private
   */
  static _drawStyledLine(
    e: CanvasPlotterEvent,
    color: string,
    strokeWidth: number,
    strokePattern: number[] | null,
    drawPoints: boolean,
    drawPointCallback: DrawPointCallback,
    pointSize: number,
  ) {
    let g = e.zgraph;
    let stepPlot = g.getBooleanOption('stepPlot', e.setName);

    if (!utils.isArrayLike(strokePattern)) {
      strokePattern = null;
    }

    let drawGapPoints = g.getBooleanOption('drawGapEdgePoints', e.setName);

    let points = e.points;
    let setName = e.setName;
    let iter = utils.createIterator(
      points,
      0,
      points.length,
      ZgraphCanvasRenderer._getIteratorPredicate(
        g.getBooleanOption('connectSeparatedPoints', setName),
      ),
    );

    let stroking = strokePattern && strokePattern.length >= 2;

    let ctx = e.drawingContext;
    ctx.save();
    if (stroking) {
      if (ctx.setLineDash) ctx.setLineDash(strokePattern!);
    }

    let decimated = ZgraphCanvasRenderer._decimateByPixel(
      iter as utils.Iterator,
      e.plotArea,
    );
    if (decimated) {
      iter = utils.createIterator(decimated, 0, decimated.length, null);
    }

    let pointsOnLine = ZgraphCanvasRenderer._drawSeries(
      e,
      iter as utils.Iterator,
      strokeWidth,
      pointSize,
      drawPoints,
      drawGapPoints,
      stepPlot,
      color,
    );
    ZgraphCanvasRenderer._drawPointsOnLine(
      e,
      pointsOnLine,
      drawPointCallback,
      color,
      pointSize,
    );

    if (stroking) {
      if (ctx.setLineDash) ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /**
   * Above this many points per horizontal pixel, individual samples cannot be
   * told apart on screen, so drawing them all only costs time.
   */
  static DECIMATION_THRESHOLD = DECIMATION_THRESHOLD;

  /**
   * Collapse a dense series to at most four points per pixel column: the
   * first, the lowest, the highest and the last. That keeps the drawn shape —
   * including every spike, which is what naive sampling loses — while making
   * the cost of a frame depend on the chart width instead of the row count.
   *
   * Returns null when the series is not dense enough to be worth reducing, in
   * which case the caller draws the original points.
   *
   * @private
   */
  static _decimateByPixel(iter: utils.Iterator, plotArea: PlotArea) {
    const arr = iter.array_ as DecimatedPoints;
    const start = iter.start_;
    const limit = iter.end_;
    const predicate = iter.predicate_;
    const width = plotArea ? plotArea.w : 0;

    if (arr._decimated) {
      return null;
    }

    if (
      !width ||
      limit - start < width * ZgraphCanvasRenderer.DECIMATION_THRESHOLD
    ) {
      return null;
    }

    const out: Point[] = [];
    let column = NaN;
    let first: Point | null = null;
    let last: Point | null = null;
    let lowest: Point | null = null;
    let highest: Point | null = null;
    let gap: Point | null = null;

    // Emit in x order so the line is drawn left to right, and never emit the
    // same point twice.
    const flush = () => {
      if (first === null && gap === null) return;
      const chosen: Point[] = [];
      const push = (p: Point | null) => {
        if (p && chosen.indexOf(p) === -1) chosen.push(p);
      };
      push(first);
      push(lowest);
      push(highest);
      push(last);
      push(gap);
      chosen.sort((a, b) => a.canvasx! - b.canvasx!);
      for (const p of chosen) out.push(p);
      first = last = lowest = highest = gap = null;
    };

    for (let i = start; i < limit; i++) {
      if (predicate && !predicate(arr, i)) continue;
      const point: Point = arr[i]!;
      const x = point.canvasx! | 0;
      if (x !== column) {
        flush();
        column = x;
      }

      const y = point.canvasy;
      // A break in the data has to survive decimation, otherwise a gap is
      // drawn as a straight line across it.
      if (y === null || y === undefined || y !== y) {
        if (gap === null) gap = point;
        continue;
      }

      if (first === null) first = point;
      last = point;
      if (lowest === null || y < lowest.canvasy!) lowest = point;
      if (highest === null || y > highest.canvasy!) highest = point;
    }
    flush();

    return out;
  }

  /**
   * This does the actual drawing of lines on the canvas, for just one series.
   * Returns a list of [canvasx, canvasy] pairs for points for which a
   * drawPointCallback should be fired.  These include isolated points, or all
   * points if drawPoints=true.
   * @param e The dictionary passed to the plotter function.
   * @private
   */
  static _drawSeries(
    e: CanvasPlotterEvent,
    iter: utils.Iterator,
    strokeWidth: number,
    pointSize: number,
    drawPoints: boolean,
    drawGapPoints: boolean,
    stepPlot: boolean,
    color: string,
  ) {
    let prevCanvasX = null;
    let prevCanvasY = null;
    let nextCanvasY = null;
    let isIsolated; // true if this point is isolated (no line segments)
    let point: Point; // the point being processed in the while loop
    let pointsOnLine: PointOnLine[] = [];
    let first = true; // the first cycle through the while loop

    let ctx = e.drawingContext;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;

    // NOTE: we break the iterator's encapsulation here for about a 25% speedup.
    let arr = iter.array_ as Point[];
    let limit = iter.end_;
    let predicate = iter.predicate_ as IteratorPredicateFn | null;

    for (let i = iter.start_; i < limit; i++) {
      point = arr[i]!;
      if (predicate) {
        while (i < limit && !predicate(arr, i)) {
          i++;
        }
        if (i === limit) break;
        point = arr[i]!;
      }

      // The 'canvasy != canvasy' test catches NaN values but not Infinity.
      // Could use !isFinite(point.canvasy); != is used for performance.
      if (point.canvasy === null || point.canvasy !== point.canvasy) {
        if (stepPlot && prevCanvasX !== null) {
          // Draw a horizontal line to the start of the missing data
          ctx.moveTo(prevCanvasX, prevCanvasY!);
          ctx.lineTo(point.canvasx!, prevCanvasY!);
        }
        prevCanvasX = prevCanvasY = null;
      } else {
        isIsolated = false;
        if (drawGapPoints || prevCanvasX === null) {
          iter.nextIdx_ = i;
          iter.next();
          nextCanvasY = iter.hasNext
            ? ((iter.peek as Point).canvasy ?? null)
            : null;

          let isNextCanvasYNullOrNaN =
            nextCanvasY === null || nextCanvasY !== nextCanvasY;
          isIsolated = prevCanvasX === null && isNextCanvasYNullOrNaN;
          if (drawGapPoints) {
            // Also consider a point to be "isolated" if it's adjacent to a
            // null point, excluding the graph edges.
            if (
              (!first && prevCanvasX === null) ||
              (iter.hasNext && isNextCanvasYNullOrNaN)
            ) {
              isIsolated = true;
            }
          }
        }

        if (prevCanvasX !== null) {
          if (strokeWidth) {
            if (stepPlot) {
              ctx.moveTo(prevCanvasX, prevCanvasY!);
              ctx.lineTo(point.canvasx!, prevCanvasY!);
            }

            ctx.lineTo(point.canvasx!, point.canvasy!);
          }
        } else {
          ctx.moveTo(point.canvasx!, point.canvasy!);
        }
        if (drawPoints || isIsolated) {
          pointsOnLine.push([point.canvasx!, point.canvasy!, point.idx]);
        }
        prevCanvasX = point.canvasx!;
        prevCanvasY = point.canvasy!;
      }
      first = false;
    }
    ctx.stroke();
    return pointsOnLine;
  }

  /**
   * This fires the drawPointCallback functions, which draw dots on the points by
   * default. This gets used when the "drawPoints" option is set, or when there
   * are isolated points.
   * @param e The dictionary passed to the plotter function.
   * @private
   */
  static _drawPointsOnLine(
    e: CanvasPlotterEvent,
    pointsOnLine: PointOnLine[],
    drawPointCallback: DrawPointCallback,
    color: string,
    pointSize: number,
  ) {
    let ctx = e.drawingContext;
    // A save/restore pair per point exists to contain a user callback that
    // leaves the context dirty. The built-in one sets everything it uses on
    // every call, so it does not need the pair — and there is one point per
    // pixel column to pay it on.
    let needsIsolation = drawPointCallback !== utils.Circles.DEFAULT;
    for (let idx = 0; idx < pointsOnLine.length; idx++) {
      let cb = pointsOnLine[idx]!;
      if (needsIsolation) ctx.save();
      drawPointCallback.call(
        e.zgraph,
        e.zgraph,
        e.setName,
        ctx,
        cb[0],
        cb[1],
        color,
        pointSize,
        cb[2],
      );
      if (needsIsolation) ctx.restore();
    }
  }

  /**
   * Attaches canvas coordinates to the points array.
   * @private
   */
  _updatePoints() {
    // Update Points
    // NOTE(danvk): pushing transforms into the canvas via matrices is trickier
    // than it sounds at first. The transformation
    // needs to be done before the .moveTo() and .lineTo() calls, but must be
    // undone before the .stroke() call to ensure that the stroke width is
    // unaffected.  An alternative is to reduce the stroke width in the
    // transformed coordinate space, but you can't specify different values for
    // each dimension (as you can with .scale()). The speedup here is ~12%.
    let sets = this.layout.points;
    for (let i = sets.length; i--;) {
      let points = sets[i]!;
      for (let j = points.length; j--;) {
        let point = points[j]!;
        point.canvasx = this.area.w * point.x! + this.area.x;
        point.canvasy = this.area.h * point.y! + this.area.y;
      }
    }
  }

  /**
   * Add canvas Actually draw the lines chart, including high/low bands.
   *
   * This function can only be called if ZgraphLayout's points array has been
   * updated with canvas{x,y} attributes, i.e. by
   * ZgraphCanvasRenderer._updatePoints.
   *
   * @param opt_seriesName when specified, only that series will
   *     be drawn. (This is used for expedited redrawing with highlightSeriesOpts)
   * @param opt_ctx when specified, the drawing
   *     context.  However, lines are typically drawn on the object's
   *     elementContext.
   * @private
   */
  _renderLineChart(
    opt_seriesName?: string | null,
    opt_ctx?: CanvasRenderingContext2D,
  ) {
    let ctx = opt_ctx || this.elementContext;
    let i;

    let sets = this.layout.points;
    let setNames = this.layout.setNames;
    let setName;

    this.colors = this.zgraph_.colorsMap_;

    // Determine which series have specialized plotters.
    let plotter_attr = this.zgraph_.getOption('plotter') as Plotter | Plotter[];
    let plotters: Plotter[] = utils.isArrayLike(plotter_attr)
      ? (plotter_attr as Plotter[])
      : [plotter_attr as Plotter];

    const setPlotters: Record<string, Plotter> = {};
    for (i = 0; i < setNames.length; i++) {
      setName = setNames[i]!;
      let setPlotter = this.zgraph_.getOption('plotter', setName) as Plotter;
      if (setPlotter === plotter_attr) continue; // not specialized.

      setPlotters[setName] = setPlotter;
    }

    for (i = 0; i < plotters.length; i++) {
      let plotter = plotters[i]!;
      let is_last = i === plotters.length - 1;

      for (let j = 0; j < sets.length; j++) {
        setName = setNames[j]!;
        if (opt_seriesName && setName !== opt_seriesName) continue;

        let points = sets[j]!;

        // Only throw in the specialized plotters on the last iteration.
        let p = plotter;
        if (setName in setPlotters) {
          if (is_last) {
            p = setPlotters[setName]!;
          } else {
            // Don't use the standard plotters in this case.
            continue;
          }
        }

        let color = this.colors[setName]!;
        let strokeWidth = this.zgraph_.getNumericOption('strokeWidth', setName);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        const plotterEvent: CanvasPlotterEvent = {
          points: points,
          setName: setName,
          setNames: setNames,
          drawingContext: ctx,
          color: color,
          strokeWidth: strokeWidth,
          zgraph: this.zgraph_,
          axis: this.zgraph_.axisPropertiesForSeries(setName),
          plotArea: this.area,
          seriesIndex: j,
          seriesCount: sets.length,
          allSeriesPoints: sets,
        };
        if (opt_seriesName != null) {
          plotterEvent.singleSeriesName = opt_seriesName;
        }
        (p as (e: CanvasPlotterEvent) => void)(plotterEvent);
        ctx.restore();
      }
    }
  }

  /**
   * Standard plotters. These may be used by clients via Zgraph.Plotters.
   * See comments there for more details.
   */
  static _Plotters = {
    linePlotter: (e: CanvasPlotterEvent) => {
      ZgraphCanvasRenderer._linePlotter(e);
    },

    fillPlotter: (e: CanvasPlotterEvent) => {
      ZgraphCanvasRenderer._fillPlotter(e);
    },

    errorPlotter: (e: CanvasPlotterEvent) => {
      ZgraphCanvasRenderer._errorPlotter(e);
    },
  };

  /**
   * Plotter which draws the central lines for a series.
   * @private
   */
  static _linePlotter(e: CanvasPlotterEvent) {
    let g = e.zgraph;
    let setName = e.setName;
    let strokeWidth = e.strokeWidth;

    let borderWidth = g.getNumericOption('strokeBorderWidth', setName);
    let drawPointCallback =
      (g.getOption('drawPointCallback', setName) as DrawPointCallback | null) ||
      utils.Circles.DEFAULT;
    let strokePattern = g.getOption('strokePattern', setName) as
      number[] | null;
    let drawPoints = g.getBooleanOption('drawPoints', setName);
    let pointSize = g.getNumericOption('pointSize', setName);

    if (borderWidth && strokeWidth) {
      ZgraphCanvasRenderer._drawStyledLine(
        e,
        g.getStringOption('strokeBorderColor', setName),
        strokeWidth + 2 * borderWidth,
        strokePattern,
        drawPoints,
        drawPointCallback,
        pointSize,
      );
    }

    ZgraphCanvasRenderer._drawStyledLine(
      e,
      e.color,
      strokeWidth,
      strokePattern,
      drawPoints,
      drawPointCallback,
      pointSize,
    );
  }

  /**
   * Draws the shaded high/low bands (confidence intervals) for each series.
   * This happens before the center lines are drawn, since the center lines
   * need to be drawn on top of the high/low bands for all series.
   * @private
   */
  static _errorPlotter(e: CanvasPlotterEvent) {
    let g = e.zgraph;
    let setName = e.setName;
    let errorBars =
      g.getBooleanOption('errorBars') || g.getBooleanOption('customBars');
    if (!errorBars) return;

    let fillGraph = g.getBooleanOption('fillGraph', setName);
    if (fillGraph) {
      log.warn(
        "Can't use fillGraph option with customBars or errorBars option",
      );
    }

    let ctx = e.drawingContext;
    let color = e.color;
    let fillAlpha = g.getNumericOption('fillAlpha', setName);
    let stepPlot = g.getBooleanOption('stepPlot', setName);
    let points = e.points;

    let iter = utils.createIterator(
      points,
      0,
      points.length,
      ZgraphCanvasRenderer._getIteratorPredicate(
        g.getBooleanOption('connectSeparatedPoints', setName),
      ),
    );

    let newYs: number[] = [];

    // setup graphics context
    let prevX = NaN;
    let prevY = NaN;
    let prevYs = [-1, -1];
    // should be same color as the lines but only 15% opaque.
    let rgb = utils.toRGB_(color)!;
    let err_color =
      'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + fillAlpha + ')';
    ctx.fillStyle = err_color;
    ctx.beginPath();

    let isNullUndefinedOrNaN = function (x: unknown) {
      return x === null || x === undefined || isNaN(x as number);
    };

    while (iter.hasNext) {
      let point = iter.next() as Point;
      if (
        (!stepPlot && isNullUndefinedOrNaN(point.y)) ||
        (stepPlot && !isNaN(prevY) && isNullUndefinedOrNaN(prevY))
      ) {
        prevX = NaN;
        continue;
      }

      newYs = [point.y_bottom ?? point.y ?? 0, point.y_top ?? point.y ?? 0];
      if (stepPlot) {
        prevY = point.y!;
      }

      // The documentation specifically disallows nulls inside the point arrays,
      // but in case it happens we should do something sensible.
      if (isNaN(newYs[0]!)) newYs[0] = point.y ?? 0;
      if (isNaN(newYs[1]!)) newYs[1] = point.y ?? 0;

      newYs[0] = e.plotArea.h * newYs[0]! + e.plotArea.y;
      newYs[1] = e.plotArea.h * newYs[1]! + e.plotArea.y;
      if (!isNaN(prevX)) {
        if (stepPlot) {
          ctx.moveTo(prevX, prevYs[0]!);
          ctx.lineTo(point.canvasx!, prevYs[0]!);
          ctx.lineTo(point.canvasx!, prevYs[1]!);
        } else {
          ctx.moveTo(prevX, prevYs[0]!);
          ctx.lineTo(point.canvasx!, newYs[0]!);
          ctx.lineTo(point.canvasx!, newYs[1]!);
        }
        ctx.lineTo(prevX, prevYs[1]!);
        ctx.closePath();
      }
      prevYs = newYs;
      prevX = point.canvasx!;
    }
    ctx.fill();
  }

  /**
   * Proxy for CanvasRenderingContext2D which drops moveTo/lineTo calls which are
   * superfluous. It accumulates all movements which haven't changed the x-value
   * and only applies the two with the most extreme y-values.
   *
   * Calls to lineTo/moveTo must have non-decreasing x-values.
   */
  static _fastCanvasProxy(context: CanvasRenderingContext2D): FastCanvasProxy {
    let pendingActions: CanvasAction[] = [];
    let lastRoundedX: number | null = null;
    let lastFlushedX: number | null = null;

    let LINE_TO = 1,
      MOVE_TO = 2;

    let actionCount = 0; // number of moveTos and lineTos passed to context.

    // Drop superfluous motions
    // Assumes all pendingActions have the same (rounded) x-value.
    let compressActions = function (opt_losslessOnly?: boolean) {
      if (pendingActions.length <= 1) return;

      // Lossless compression: drop inconsequential moveTos.
      for (let i = pendingActions.length - 1; i > 0; i--) {
        let action = pendingActions[i]!;
        if (action[0] === MOVE_TO) {
          let prevAction = pendingActions[i - 1]!;
          if (prevAction[1] === action[1] && prevAction[2] === action[2]) {
            pendingActions.splice(i, 1);
          }
        }
      }

      // Lossless compression: ... drop consecutive moveTos ...
      for (
        let i = 0;
        i < pendingActions.length - 1 /* incremented internally */;
      ) {
        let action = pendingActions[i]!;
        if (action[0] === MOVE_TO && pendingActions[i + 1]![0] === MOVE_TO) {
          pendingActions.splice(i, 1);
        } else {
          i++;
        }
      }

      // Lossy compression: ... drop all but the extreme y-values ...
      if (pendingActions.length > 2 && !opt_losslessOnly) {
        // keep an initial moveTo, but drop all others.
        let startIdx = 0;
        if (pendingActions[0]![0] === MOVE_TO) startIdx++;
        let minIdx: number | null = null,
          maxIdx: number | null = null;
        for (let i = startIdx; i < pendingActions.length; i++) {
          let action = pendingActions[i]!;
          if (action[0] !== LINE_TO) continue;
          if (minIdx === null && maxIdx === null) {
            minIdx = i;
            maxIdx = i;
          } else {
            let y = action[2];
            if (y < pendingActions[minIdx!]![2]) {
              minIdx = i;
            } else if (y > pendingActions[maxIdx!]![2]) {
              maxIdx = i;
            }
          }
        }
        let minAction = pendingActions[minIdx!]!,
          maxAction = pendingActions[maxIdx!]!;
        pendingActions.splice(startIdx, pendingActions.length - startIdx);
        if (minIdx! < maxIdx!) {
          pendingActions.push(minAction);
          pendingActions.push(maxAction);
        } else if (minIdx! > maxIdx!) {
          pendingActions.push(maxAction);
          pendingActions.push(minAction);
        } else {
          pendingActions.push(minAction);
        }
      }
    };

    let flushActions = function (opt_noLossyCompression?: boolean) {
      compressActions(opt_noLossyCompression);
      for (let i = 0, len = pendingActions.length; i < len; i++) {
        let action = pendingActions[i]!;
        if (action[0] === LINE_TO) {
          context.lineTo(action[1], action[2]);
        } else if (action[0] === MOVE_TO) {
          context.moveTo(action[1], action[2]);
        }
      }
      if (pendingActions.length) {
        lastFlushedX = pendingActions[pendingActions.length - 1]![1];
      }
      actionCount += pendingActions.length;
      pendingActions = [];
    };

    let addAction = function (action: number, x: number, y: number) {
      let rx = Math.round(x);
      if (lastRoundedX === null || rx !== lastRoundedX) {
        // if there are large gaps on the x-axis, it's essential to keep the
        // first and last point as well.
        let hasGapOnLeft = lastRoundedX! - lastFlushedX! > 1,
          hasGapOnRight = rx - lastRoundedX! > 1,
          hasGap = hasGapOnLeft || hasGapOnRight;
        flushActions(hasGap);
        lastRoundedX = rx;
      }
      pendingActions.push([action, x, y]);
    };

    return {
      moveTo(x: number, y: number) {
        addAction(MOVE_TO, x, y);
      },
      lineTo(x: number, y: number) {
        addAction(LINE_TO, x, y);
      },

      // for major operations like stroke/fill, we skip compression to ensure
      // that there are no artifacts at the right edge.
      stroke() {
        flushActions(true);
        context.stroke();
      },
      fill() {
        flushActions(true);
        context.fill();
      },
      beginPath() {
        flushActions(true);
        context.beginPath();
      },
      closePath() {
        flushActions(true);
        context.closePath();
      },

      _count() {
        return actionCount;
      },
    };
  }

  /**
   * Draws the shaded regions when "fillGraph" is set.
   * Not to be confused with high/low bands (historically misnamed errorBars).
   *
   * For stacked charts, it's more convenient to handle all the series
   * simultaneously. So this plotter plots all the points on the first series
   * it's asked to draw, then ignores all the other series.
   *
   * @private
   */
  static _fillPlotter(e: CanvasPlotterEvent) {
    // Skip if we're drawing a single series for interactive highlight overlay.
    if (e.singleSeriesName) return;

    // We'll handle all the series at once, not one-by-one.
    if (e.seriesIndex !== 0) return;

    let g = e.zgraph;
    let setNames = g.getLabels()!.slice(1); // remove x-axis

    // getLabels() includes names for invisible series, which are not included in
    // allSeriesPoints. We remove those to make the two match.
    for (let i = setNames.length; i >= 0; i--) {
      if (!g.visibility()[i]) setNames.splice(i, 1);
    }

    let anySeriesFilled = (function () {
      for (let i = 0; i < setNames.length; i++) {
        if (g.getBooleanOption('fillGraph', setNames[i]!)) return true;
      }
      return false;
    })();

    if (!anySeriesFilled) return;

    let area = e.plotArea;
    let sets = e.allSeriesPoints!;
    let setCount = sets.length;

    let stackedGraph = g.getBooleanOption('stackedGraph');
    let colors = g.getColors();

    // For stacked graphs, track the baseline for filling.
    //
    // The filled areas below graph lines are trapezoids with two
    // vertical edges. The top edge is the line segment being drawn, and
    // the baseline is the bottom edge. Each baseline corresponds to the
    // top line segment from the previous stacked line. In the case of
    // step plots, the trapezoids are rectangles.
    const baseline: Record<number, number | [number, number]> = {};
    let currBaseline;
    let prevStepPlot; // for different line drawing modes (line/step) per series

    // Helper function to trace a line back along the baseline.
    let traceBackPath = function (
      ctx: FillContext,
      baselineX: number,
      baselineY: number,
      pathBack: [number, number][],
    ) {
      ctx.lineTo(baselineX, baselineY);
      if (stackedGraph) {
        for (let i = pathBack.length - 1; i >= 0; i--) {
          let pt = pathBack[i]!;
          ctx.lineTo(pt[0], pt[1]);
        }
      }
    };

    // process sets in reverse order (needed for stacked graphs)
    for (let setIdx = setCount - 1; setIdx >= 0; setIdx--) {
      let ctx: FillContext = e.drawingContext;
      let setName = setNames[setIdx]!;
      if (!g.getBooleanOption('fillGraph', setName)) continue;

      let fillAlpha = g.getNumericOption('fillAlpha', setName);
      let stepPlot = g.getBooleanOption('stepPlot', setName);
      let color = colors[setIdx]!;
      let axis = g.axisPropertiesForSeries(setName);
      let axisY = 1.0 + axis.minyval! * axis.yscale!;
      if (axisY < 0.0) axisY = 0.0;
      else if (axisY > 1.0) axisY = 1.0;
      axisY = area.h * axisY + area.y;

      let points = sets[setIdx]!;
      let iter = utils.createIterator(
        points,
        0,
        points.length,
        ZgraphCanvasRenderer._getIteratorPredicate(
          g.getBooleanOption('connectSeparatedPoints', setName),
        ),
      );

      // setup graphics context
      let prevX = NaN;
      let prevYs = [-1, -1];
      let newYs;
      // should be same color as the lines but only 15% opaque.
      let rgb = utils.toRGB_(color)!;
      let err_color =
        'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + fillAlpha + ')';
      ctx.fillStyle = err_color;
      ctx.beginPath();
      let last_x,
        is_first = true;

      // If the point density is high enough, dropping segments on their way to
      // the canvas justifies the overhead of doing so.
      if (
        points.length > 2 * g.width_ ||
        (g.constructor as { FORCE_FAST_PROXY?: boolean }).FORCE_FAST_PROXY
      ) {
        ctx = ZgraphCanvasRenderer._fastCanvasProxy(ctx);
      }

      // For filled charts, we draw points from left to right, then back along
      // the x-axis to complete a shape for filling.
      // For stacked plots, this "back path" is a more complex shape. This array
      // stores the [x, y] values needed to trace that shape.
      let pathBack: [number, number][] = [];

      // Logic clearer if stackGraph/stepPlot were separate sub-plotters.
      let point: Point | null = null;
      while (iter.hasNext) {
        point = iter.next() as Point;
        if (!utils.isOK(point.y) && !stepPlot) {
          traceBackPath(ctx, prevX, prevYs[1]!, pathBack);
          pathBack = [];
          prevX = NaN;
          if (point.y_stacked !== null && !isNaN(point.y_stacked!)) {
            baseline[point.canvasx!] = area.h * point.y_stacked! + area.y;
          }
          continue;
        }
        if (stackedGraph) {
          if (!is_first && last_x === point.xval) {
            continue;
          } else {
            is_first = false;
            last_x = point.xval!;
          }

          currBaseline = baseline[point.canvasx!];
          let lastY: number;
          if (currBaseline === undefined) {
            lastY = axisY;
          } else if (prevStepPlot && Array.isArray(currBaseline)) {
            lastY = currBaseline[0];
          } else {
            lastY = currBaseline as number;
          }
          newYs = [point.canvasy!, lastY];

          if (stepPlot) {
            // Step plots must keep track of the top and bottom of
            // the baseline at each point.
            if (prevYs[0] === -1) {
              baseline[point.canvasx!] = [point.canvasy!, axisY];
            } else {
              baseline[point.canvasx!] = [point.canvasy!, prevYs[0]!];
            }
          } else {
            baseline[point.canvasx!] = point.canvasy!;
          }
        } else {
          if (isNaN(point.canvasy!) && stepPlot) {
            newYs = [area.y + area.h, axisY];
          } else {
            newYs = [point.canvasy!, axisY];
          }
        }
        if (!isNaN(prevX)) {
          // Move to top fill point
          if (stepPlot) {
            ctx.lineTo(point.canvasx!, prevYs[0]!);
            ctx.lineTo(point.canvasx!, newYs[0]!);
          } else {
            ctx.lineTo(point.canvasx!, newYs[0]!);
          }

          // Record the baseline for the reverse path.
          if (stackedGraph) {
            pathBack.push([prevX, prevYs[1]!]);
            if (prevStepPlot && currBaseline && Array.isArray(currBaseline)) {
              // Draw to the bottom of the baseline
              pathBack.push([point.canvasx!, currBaseline[1]]);
            } else {
              pathBack.push([point.canvasx!, newYs[1]!]);
            }
          }
        } else {
          ctx.moveTo(point.canvasx!, newYs[1]!);
          ctx.lineTo(point.canvasx!, newYs[0]!);
        }
        prevYs = newYs;
        prevX = point.canvasx!;
      }
      prevStepPlot = stepPlot;
      if (newYs && point) {
        traceBackPath(ctx, point.canvasx!, newYs[1]!, pathBack);
        pathBack = [];
      }
      ctx.fill();
    }
  }
}

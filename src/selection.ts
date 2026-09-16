/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Selection: which row and which series the pointer (or the keyboard) is on,
 * how it is found from a coordinate, and how the highlight is drawn and faded.
 */

import * as utils from "./utils";
import type { Point } from "./types";
import type Zpgraph from "./zpgraph";

/**
 * Given a canvas X coordinate, find the closest row.
 * @param domX graph-relative DOM X coordinate
 * Returns {number} row number.
 * @private
 */
export const findClosestRow = (g: Zpgraph, domX: number) => {
  let minDistX = Infinity;
  let closestRow = -1;
  let sets = g.layout_.points;

  for (let i = 0; i < sets.length; i++) {
    let points = sets[i]!;
    let len = points.length;
    if (!len) continue;

    // Points within a set are ordered by canvasx, so the nearest one sits
    // beside the insertion point of domX rather than anywhere in the set.
    // This runs on every mousemove; the scan it replaces was O(points).
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      let mid = (lo + hi) >>> 1;
      if (points[mid]!.canvasx! < domX) lo = mid + 1;
      else hi = mid;
    }

    let consider = (j: number) => {
      let point = points[j]!;
      if (!utils.isValidPoint(point, true)) return false;
      let dist = Math.abs(point.canvasx! - domX);
      if (dist < minDistX) {
        minDistX = dist;
        closestRow = point.idx;
      }
      return true;
    };

    // Distance grows monotonically away from the insertion point, so the
    // first valid point found in each direction is the best in it.
    for (let j = lo - 1; j >= 0; j--) if (consider(j)) break;
    for (let j = lo; j < len; j++) if (consider(j)) break;
  }

  return closestRow;
};

/**
 * Given canvas X,Y coordinates, find the closest point.
 *
 * This finds the individual data point across all visible series
 * that's closest to the supplied DOM coordinates using the standard
 * Euclidean X,Y distance.
 *
 * @param domX graph-relative DOM X coordinate
 * @param domY graph-relative DOM Y coordinate
 * Returns: {row, seriesName, point}
 * @private
 */
export const findClosestPoint = (g: Zpgraph, domX: number, domY = 0) => {
  let minDist = Infinity;
  let dist: number;
  let dx: number;
  let dy: number;
  let closestPoint: Point | undefined;
  let closestSeries: number | undefined;
  let closestRow: number | undefined;
  for (let setIdx = g.layout_.points.length - 1; setIdx >= 0; --setIdx) {
    let points = g.layout_.points[setIdx]!;
    for (let i = 0; i < points.length; ++i) {
      let point = points[i]!;
      if (!utils.isValidPoint(point)) continue;
      dx = point.canvasx! - domX;
      dy = point.canvasy! - domY;
      dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        closestPoint = point;
        closestSeries = setIdx;
        closestRow = point.idx;
      }
    }
  }
  let name = g.layout_.setNames[closestSeries!]!;
  return {
    row: closestRow!,
    seriesName: name,
    point: closestPoint!,
  };
};

/**
 * Given canvas X,Y coordinates, find the touched area in a stacked graph.
 *
 * This first finds the X data point closest to the supplied DOM X coordinate,
 * then finds the series which puts the Y coordinate on top of its filled area,
 * using linear interpolation between adjacent point pairs.
 *
 * @param domX graph-relative DOM X coordinate
 * @param domY graph-relative DOM Y coordinate
 * Returns: {row, seriesName, point}
 * @private
 */
export const findStackedPoint = (g: Zpgraph, domX: number, domY: number) => {
  let row = findClosestRow(g, domX);
  let closestPoint: Point | undefined;
  let closestSeries: number | undefined;
  for (let setIdx = 0; setIdx < g.layout_.points.length; ++setIdx) {
    let boundary = getLeftBoundary(g, setIdx);
    let rowIdx = row - boundary;
    let points = g.layout_.points[setIdx]!;
    if (rowIdx >= points.length) continue;
    let p1 = points[rowIdx]!;
    if (!utils.isValidPoint(p1)) continue;
    let py = p1.canvasy!;
    if (domX > p1.canvasx! && rowIdx + 1 < points.length) {
      // interpolate series Y value using next point
      let p2 = points[rowIdx + 1]!;
      if (utils.isValidPoint(p2)) {
        let dx = p2.canvasx! - p1.canvasx!;
        if (dx > 0) {
          let r = (domX - p1.canvasx!) / dx;
          py += r * (p2.canvasy! - p1.canvasy!);
        }
      }
    } else if (domX < p1.canvasx! && rowIdx > 0) {
      // interpolate series Y value using previous point
      let p0 = points[rowIdx - 1]!;
      if (utils.isValidPoint(p0)) {
        let dx = p1.canvasx! - p0.canvasx!;
        if (dx > 0) {
          let r = (p1.canvasx! - domX) / dx;
          py += r * (p0.canvasy! - p1.canvasy!);
        }
      }
    }
    // Stop if the point (domX, py) is above this series' upper edge
    if (setIdx === 0 || py < domY) {
      closestPoint = p1;
      closestSeries = setIdx;
    }
  }
  let name = g.layout_.setNames[closestSeries!]!;
  return {
    row: row,
    seriesName: name,
    point: closestPoint!,
  };
};

/**
 * When the mouse moves in the canvas, display information about a nearby data
 * point and draw dots over those points in the data series. This function
 * takes care of cleanup of previously-drawn dots.
 * @param event The mousemove event from the browser.
 * @private
 */
export const mouseMove = (g: Zpgraph, event: MouseEvent) => {
  // This prevents JS errors when mousing over the canvas before data loads.
  let points = g.layout_.points;
  if (points === undefined || points === null) return;

  let canvasCoords = g.eventToDomCoords(event);
  let canvasx = canvasCoords[0]!;
  let canvasy = canvasCoords[1]!;

  let highlightSeriesOpts = g.getOption("highlightSeriesOpts");
  let selectionChanged = false;
  if (highlightSeriesOpts && !g.isSeriesLocked()) {
    let closest;
    if (g.getBooleanOption("stackedGraph")) {
      closest = findStackedPoint(g, canvasx, canvasy);
    } else {
      closest = findClosestPoint(g, canvasx, canvasy);
    }
    selectionChanged = setSelection(g, closest.row, closest.seriesName);
  } else {
    let idx = findClosestRow(g, canvasx);
    selectionChanged = setSelection(g, idx);
  }

  let callback = g.getFunctionOption("highlightCallback");
  if (callback && selectionChanged) {
    callback.call(
      g,
      event,
      g.lastx_,
      g.selPoints_,
      g.lastRow_,
      g.highlightSet_,
    );
  }
};

/**
 * Fetch left offset from the specified set index or if not passed, the
 * first defined boundaryIds record (see bug #236).
 * @private
 */
export const getLeftBoundary = (g: Zpgraph, setIdx: number) => {
  if (g.boundaryIds_[setIdx]) {
    return g.boundaryIds_[setIdx]![0];
  } else {
    for (const ids of g.boundaryIds_) {
      if (ids !== undefined) {
        return ids[0];
      }
    }
    return 0;
  }
};

export const animateSelection = (g: Zpgraph, direction: number) => {
  let totalSteps = 10;
  let millis = 30;
  if (g.fadeLevel === undefined) g.fadeLevel = 0;
  if (g.animateId === undefined) g.animateId = 0;
  let start = g.fadeLevel;
  let steps = direction < 0 ? start : totalSteps - start;
  if (steps <= 0) {
    if (g.fadeLevel) {
      updateSelection(g, 1.0);
    }
    return;
  }

  let thisId = ++g.animateId;
  let that = g;

  utils.repeatAndCleanup(
    function (step: number) {
      // ignore simultaneous animations
      if (that.animateId !== thisId) return;

      that.fadeLevel = start + (step + 1) * direction;
      if (that.fadeLevel === 0) {
        that.clearSelection();
      } else {
        that.updateSelection_(that.fadeLevel / totalSteps);
      }
    },
    steps,
    millis,
    function () {},
  );
};

/**
 * Draw dots over the selectied points in the data series. This function
 * takes care of cleanup of previously-drawn dots.
 * @private
 */
export const updateSelection = (g: Zpgraph, opt_animFraction?: number) => {
  /*let defaultPrevented = */
  g.cascadeEvents_("select", {
    selectedRow: g.lastRow_ === -1 ? undefined : g.lastRow_,
    selectedX: g.lastx_ === null ? undefined : g.lastx_,
    selectedPoints: g.selPoints_,
  });

  // Clear the previously drawn vertical, if there is one
  let i;
  let ctx = g.canvas_ctx_;
  if (g.getOption("highlightSeriesOpts")) {
    ctx.clearRect(0, 0, g.width_, g.height_);
    let alpha = 1.0 - g.getNumericOption("highlightSeriesBackgroundAlpha");
    let backgroundColor = utils.toRGB_(
      g.getOption("highlightSeriesBackgroundColor") as string,
    );

    if (alpha) {
      // Activating background fade includes an animation effect for a gradual
      // fade. Controlled by animateBackgroundFade.
      let animateBackgroundFade = g.getBooleanOption("animateBackgroundFade");
      if (animateBackgroundFade) {
        if (opt_animFraction === undefined) {
          // start a new animation
          animateSelection(g, 1);
          return;
        }
        alpha *= opt_animFraction;
      }
      ctx.fillStyle =
        "rgba(" +
        backgroundColor!.r +
        "," +
        backgroundColor!.g +
        "," +
        backgroundColor!.b +
        "," +
        alpha +
        ")";
      ctx.fillRect(0, 0, g.width_, g.height_);
    }

    // Redraw only the highlighted series in the interactive canvas (not the
    // static plot canvas, which is where series are usually drawn).
    g.plotter_._renderLineChart(g.highlightSet_, ctx);
  } else if (g.previousVerticalX_ >= 0) {
    // Determine the maximum highlight circle size.
    let maxCircleSize = 0;
    let labels = g.attr_("labels") as string[];
    for (i = 1; i < labels.length; i++) {
      let r = g.getNumericOption("highlightCircleSize", labels[i]!);
      if (r > maxCircleSize) maxCircleSize = r;
    }
    let px = g.previousVerticalX_;
    ctx.clearRect(px - maxCircleSize - 1, 0, 2 * maxCircleSize + 2, g.height_);
  }

  if (g.selPoints_.length > 0) {
    // Draw colored circles over the center of each selected point
    const canvasx = g.selPoints_[0]!.canvasx!;
    ctx.save();
    for (i = 0; i < g.selPoints_.length; i++) {
      const pt = g.selPoints_[i]!;
      if (isNaN(pt.canvasy!)) continue;

      let circleSize = g.getNumericOption("highlightCircleSize", pt.name);
      let callback = g.getFunctionOption(
        "drawHighlightPointCallback",
        pt.name,
      ) as typeof utils.Circles.DEFAULT | undefined;
      const color = g.plotter_.colors[pt.name] ?? "#000";
      if (!callback) {
        callback = utils.Circles.DEFAULT;
      }
      ctx.lineWidth = g.getNumericOption("strokeWidth", pt.name);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      callback.call(
        g,
        g,
        pt.name,
        ctx,
        canvasx,
        pt.canvasy!,
        color,
        circleSize,
        pt.idx,
      );
    }
    ctx.restore();

    g.previousVerticalX_ = canvasx;
  }
};

/**
 * Manually set the selected points and display information about them in the
 * legend. The selection can be cleared using clearSelection() and queried
 * using getSelection().
 *
 * To set a selected series but not a selected point, call setSelection with
 * row=false and the selected series name.
 *
 * @param row Row number that should be highlighted (i.e. appear with
 * hover dots on the chart).
 * @param optional series name to highlight that series with the
 * the highlightSeriesOpts setting.
 * @param optional If true, keep seriesName selected when mousing
 * over the graph, disabling closest-series highlighting. Call clearSelection()
 * to unlock it.
 * @param optional If true, trigger any
 * user-defined highlightCallback if highlightCallback has been set.
 */
export const setSelection = (
  g: Zpgraph,
  row: number | number[] | false,
  opt_seriesName?: string | null,
  opt_locked?: boolean,
  opt_trigger_highlight_callback?: boolean,
) => {
  // Extract the points we've selected
  g.selPoints_ = [];

  let changed = false;
  if (row !== false && typeof row === "number" && row >= 0) {
    const selectedRow: number = row;
    if (selectedRow !== g.lastRow_) changed = true;
    g.lastRow_ = selectedRow;
    for (let setIdx = 0; setIdx < g.layout_.points.length; ++setIdx) {
      let points = g.layout_.points[setIdx]!;
      // Check if the point at the appropriate index is the point we're looking
      // for.  If it is, just use it, otherwise search the array for a point
      // in the proper place.
      let pointIndex: number = selectedRow - getLeftBoundary(g, setIdx);
      if (
        pointIndex >= 0 &&
        pointIndex < points.length &&
        points[pointIndex]!.idx === selectedRow
      ) {
        let point = points[pointIndex]!;
        if (point.yval !== null) g.selPoints_.push(point);
      } else {
        for (let pointIdx = 0; pointIdx < points.length; ++pointIdx) {
          let point = points[pointIdx]!;
          if (point.idx === selectedRow) {
            if (point.yval !== null) {
              g.selPoints_.push(point);
            }
            break;
          }
        }
      }
    }
  } else {
    if (g.lastRow_ >= 0) changed = true;
    g.lastRow_ = -1;
  }

  if (g.selPoints_.length) {
    g.lastx_ = g.selPoints_[0]!.xval ?? null;
  } else {
    g.lastx_ = null;
  }

  if (opt_seriesName !== undefined) {
    if (g.highlightSet_ !== opt_seriesName) changed = true;
    g.highlightSet_ = opt_seriesName;
  }

  if (opt_locked !== undefined) {
    g.lockedSet_ = opt_locked;
  }

  if (changed) {
    updateSelection(g, undefined);

    if (opt_trigger_highlight_callback) {
      let callback = g.getFunctionOption("highlightCallback");
      if (callback) {
        const event = {} as MouseEvent;
        callback.call(
          g,
          event,
          g.lastx_,
          g.selPoints_,
          g.lastRow_,
          g.highlightSet_,
        );
      }
    }
  }
  return changed;
};

/**
 * The mouse has left the canvas. Clear out whatever artifacts remain
 * @param event the mouseout event from the browser.
 * @private
 */
export const mouseOut = (g: Zpgraph, event: MouseEvent) => {
  if (g.getFunctionOption("unhighlightCallback")) {
    g.getFunctionOption("unhighlightCallback").call(g, event);
  }

  if (g.getBooleanOption("hideOverlayOnMouseOut") && !g.lockedSet_) {
    clearSelection(g);
  }
};

/**
 * Clears the current selection (i.e. points that were highlighted by moving
 * the mouse over the chart).
 */
export const clearSelection = (g: Zpgraph) => {
  g.cascadeEvents_("deselect", {});

  g.lockedSet_ = false;
  // Get rid of the overlay data
  if (g.fadeLevel) {
    animateSelection(g, -1);
    return;
  }
  g.canvas_ctx_.clearRect(0, 0, g.width_, g.height_);
  g.fadeLevel = 0;
  g.selPoints_ = [];
  g.lastx_ = null;
  g.lastRow_ = -1;
  g.highlightSet_ = null;
};

/**
 * Returns the number of the currently selected row. To get data for this row,
 * you can use the getValue method.
 * @return row number, or -1 if nothing is selected
 */
export const getSelection = (g: Zpgraph) => {
  if (!g.selPoints_ || g.selPoints_.length < 1) {
    return -1;
  }

  for (let setIdx = 0; setIdx < g.layout_.points.length; setIdx++) {
    const points = g.layout_.points[setIdx]!;
    for (const point of points) {
      if (point.x === g.selPoints_[0]!.x) {
        return point.idx;
      }
    }
  }
  return -1;
};

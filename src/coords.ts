/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * The visible ranges and the conversions between the three coordinate systems
 * the chart deals with: data values, pixels in the page, and 0..1 fractions of
 * the plot area.
 */

import * as utils from "./utils";
import type Zpgraph from "./zpgraph";

/**
 * Returns the currently-visible x-range. This can be affected by zooming,
 * panning or a call to updateOptions.
 * Returns a two-element array: [left, right].
 * If the Zpgraph has dates on the x-axis, these will be millis since epoch.
 */
export const xAxisRange = (g: Zpgraph): [number, number] => {
  return g.dateWindow_ ? g.dateWindow_ : xAxisExtremes(g);
};

/**
 * Returns the lower- and upper-bound x-axis values of the data set.
 */
export const xAxisExtremes = (g: Zpgraph): [number, number] => {
  const pad = g.getNumericOption("xRangePad") / g.plotter_.area.w;
  if (g.numRows() === 0) {
    return [0 - pad, 1 + pad];
  }
  let left = g.rawData_[0]![0] as number;
  let right = g.rawData_[g.rawData_.length - 1]![0] as number;
  if (pad) {
    // Must keep this in sync with layout _evaluateLimits()
    const range = right - left;
    left -= range * pad;
    right += range * pad;
  }
  return [left, right];
};

/**
 * Returns the currently-visible y-range for an axis. This can be affected by
 * zooming, panning or a call to updateOptions. Axis indices are zero-based. If
 * called with no arguments, returns the range of the first axis.
 * Returns a two-element array: [bottom, top].
 */
export const yAxisRange = (
  g: Zpgraph,
  idx?: number,
): [number, number] | null => {
  if (typeof idx == "undefined") {
    idx = 0;
  }
  if (idx < 0 || idx >= g.axes_.length) {
    return null;
  }
  const axis = g.axes_[idx]!;
  const range = axis.computedValueRange!;
  return [range[0]!, range[1]!];
};

/**
 * Returns the currently-visible y-ranges for each axis. This can be affected by
 * zooming, panning, calls to updateOptions, etc.
 * Returns an array of [bottom, top] pairs, one for each y-axis.
 */
export const yAxisRanges = (g: Zpgraph) =>
  g.axes_.map((_, i) => yAxisRange(g, i));

/**
 * Convert from data coordinates to canvas/div X/Y coordinates.
 * If specified, do this conversion for the coordinate system of a particular
 * axis. Uses the first axis by default.
 * Returns a two-element array: [X, Y]
 *
 * Note: use toDomXCoord instead of toDomCoords(x, null) and use toDomYCoord
 * instead of toDomCoords(null, y, axis).
 */
export const toDomCoords = (
  g: Zpgraph,
  x: number | null,
  y: number | null,
  axis?: number,
) => {
  return [toDomXCoord(g, x), toDomYCoord(g, y, axis)];
};

/**
 * Convert from data x coordinates to canvas/div X coordinate.
 * If specified, do this conversion for the coordinate system of a particular
 * axis.
 * Returns a single value or null if x is null.
 */
export const toDomXCoord = (g: Zpgraph, x: number | null) => {
  if (x === null) {
    return null;
  }

  const area = g.plotter_.area;
  const xRange = xAxisRange(g);
  return area.x + ((x - xRange[0]) / (xRange[1] - xRange[0])) * area.w;
};

/**
 * Convert from data x coordinates to canvas/div Y coordinate and optional
 * axis. Uses the first axis by default.
 *
 * returns a single value or null if y is null.
 */
export const toDomYCoord = (g: Zpgraph, y: number | null, axis?: number) => {
  const pct = g.toPercentYCoord(y, axis);

  if (pct === null) {
    return null;
  }
  const area = g.plotter_.area;
  return area.y + pct * area.h;
};

/**
 * Convert from canvas/div coords to data coordinates.
 * If specified, do this conversion for the coordinate system of a particular
 * axis. Uses the first axis by default.
 * Returns a two-element array: [X, Y].
 *
 * Note: use toDataXCoord instead of toDataCoords(x, null) and use toDataYCoord
 * instead of toDataCoords(null, y, axis).
 */
export const toDataCoords = (
  g: Zpgraph,
  x: number | null,
  y: number | null,
  axis?: number,
) => {
  return [toDataXCoord(g, x), toDataYCoord(g, y, axis)];
};

/**
 * Convert from canvas/div x coordinate to data coordinate.
 *
 * If x is null, this returns null.
 */
export const toDataXCoord = (g: Zpgraph, x: number | null) => {
  if (x === null) {
    return null;
  }

  const area = g.plotter_.area;
  const xRange = xAxisRange(g);

  if (!g.attributes_.getForAxis("logscale", "x")) {
    return xRange[0] + ((x - area.x) / area.w) * (xRange[1] - xRange[0]);
  }
  const pct = (x - area.x) / area.w;
  return utils.logRangeFraction(xRange[0], xRange[1], pct);
};

/**
 * Convert from canvas/div y coord to value.
 *
 * If y is null, this returns null.
 * if axis is null, this uses the first axis.
 */
export const toDataYCoord = (g: Zpgraph, y: number | null, axis?: number) => {
  if (y === null) {
    return null;
  }

  const area = g.plotter_.area;
  if (typeof axis == "undefined") {
    axis = 0;
  }
  const yRange = yAxisRange(g, axis)!;
  const y0 = yRange[0]!;
  const y1 = yRange[1]!;

  if (!g.attributes_.getForAxis("logscale", axis)) {
    return y0 + ((area.y + area.h - y) / area.h) * (y1 - y0);
  }
  // Computing the inverse of toDomCoord.
  const pct = (y - area.y) / area.h;
  // Note reversed yRange, y1 is on top with pct==0.
  return utils.logRangeFraction(y1, y0, pct);
};

/**
 * Converts a y for an axis to a percentage from the top to the
 * bottom of the drawing area.
 *
 * If the coordinate represents a value visible on the canvas, then
 * the value will be between 0 and 1, where 0 is the top of the canvas.
 * However, this method will return values outside the range, as
 * values can fall outside the canvas.
 *
 * If y is null, this returns null.
 * if axis is null, this uses the first axis.
 *
 * @param y The data y-coordinate.
 * @param [axis] The axis number on which the data coordinate lives.
 * @return A fraction in [0, 1] where 0 = the top edge.
 */
export const toPercentYCoord = (
  g: Zpgraph,
  y: number | null,
  axis?: number,
) => {
  if (y === null) {
    return null;
  }
  if (typeof axis == "undefined") {
    axis = 0;
  }

  const yRange = yAxisRange(g, axis)!;
  const y0 = yRange[0]!;
  const y1 = yRange[1]!;

  let pct;
  const logscale = g.attributes_.getForAxis("logscale", axis);
  if (logscale) {
    const logr0 = utils.log10(y0);
    const logr1 = utils.log10(y1);
    pct = (logr1 - utils.log10(y)) / (logr1 - logr0);
  } else {
    // yRange[1] - y is unit distance from the bottom.
    // yRange[1] - yRange[0] is the scale of the range.
    // (yRange[1] - y) / (yRange[1] - yRange[0]) is the % from the bottom.
    pct = (y1 - y) / (y1 - y0);
  }
  return pct;
};

/**
 * Converts an x value to a percentage from the left to the right of
 * the drawing area.
 *
 * If the coordinate represents a value visible on the canvas, then
 * the value will be between 0 and 1, where 0 is the left of the canvas.
 * However, this method will return values outside the range, as
 * values can fall outside the canvas.
 *
 * If x is null, this returns null.
 * @param x The data x-coordinate.
 * @return A fraction in [0, 1] where 0 = the left edge.
 */
export const toPercentXCoord = (g: Zpgraph, x: number | null) => {
  if (x === null) {
    return null;
  }

  const xRange = xAxisRange(g);
  let pct;
  const logscale = g.attributes_.getForAxis("logscale", "x");
  if (logscale === true) {
    // logscale can be null so we test for true explicitly.
    const logr0 = utils.log10(xRange[0]);
    const logr1 = utils.log10(xRange[1]);
    pct = (utils.log10(x) - logr0) / (logr1 - logr0);
  } else {
    // x - xRange[0] is unit distance from the left.
    // xRange[1] - xRange[0] is the scale of the range.
    // The full expression below is the % from the left.
    pct = (x - xRange[0]) / (xRange[1] - xRange[0]);
  }
  return pct;
};

/**
 * Convert a mouse event to DOM coordinates relative to the graph origin.
 *
 * Returns a two-element array: [X, Y].
 */
export const eventToDomCoords = (g: Zpgraph, event: MouseEvent) => {
  if (event.offsetX && event.offsetY) {
    return [event.offsetX, event.offsetY];
  }
  const eventElementPos = utils.findPos(g.mouseEventElement_);
  const canvasx = utils.pageX(event) - eventElementPos.x;
  const canvasy = utils.pageY(event) - eventElementPos.y;
  return [canvasx, canvasy];
};

"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import type {
  AxisProperties,
  OptionsManagerLike,
  RawData,
  RawDataCell,
  UnifiedSeries,
} from "../internal-types";
import type { Point } from "../types";

/** Series label at index from options `labels` array. */
const seriesLabel = (
  options: OptionsManagerLike,
  seriesIndex: number,
): string => {
  const labels = options.get("labels");
  if (!Array.isArray(labels)) {
    return "";
  }
  const label = labels[seriesIndex];
  return typeof label === "string" ? label : String(label ?? "");
};

/**
 * Reads a per-series option. Every handler needs the series label before it can
 * ask for `logscale` or `sigma`, and the label only ever comes from the index.
 */
export const seriesOption = (
  options: OptionsManagerLike,
  seriesIndex: number,
  name: string,
): unknown => options.getForSeries(name, seriesLabel(options, seriesIndex));

/** Boolean per-series option (logscale, wilsonInterval, …). */
export const seriesBoolean = (
  options: OptionsManagerLike,
  seriesIndex: number,
  name: string,
): boolean => Boolean(seriesOption(options, seriesIndex, name));

/** Numeric per-series option (sigma, …). */
export const seriesNumber = (
  options: OptionsManagerLike,
  seriesIndex: number,
  name: string,
): number => {
  const v = seriesOption(options, seriesIndex, name);
  return typeof v === "number" ? v : Number(v);
};

/** X cell from a raw row (number or Date → millis). */
export const rawX = (cell: RawDataCell): number =>
  typeof cell === "number"
    ? cell
    : cell instanceof Date
      ? cell.valueOf()
      : Number(cell);

/** Scalar Y cell from a raw row. */
export const rawY = (cell: RawDataCell): number | null =>
  cell === null || typeof cell === "number" ? cell : null;

/** Nested Y cell (error/custom/fraction bars). */
export const rawYArray = (cell: RawDataCell): Array<number | null> | null =>
  Array.isArray(cell) ? cell : null;

/**
 * The data handler is responsible for all data specific operations. All of the
 * series data it receives and returns is always in the unified data format.
 * Initially the unified data is created by the extractSeries method.
 */
abstract class ZpgraphDataHandler {
  /** X-value array index constant for unified data samples. */
  static X = 0;

  /** Y-value array index constant for unified data samples. */
  static Y = 1;

  /** Extras-value array index constant for unified data samples. */
  static EXTRAS = 2;

  /** Points of the last draw, per series name. See seriesToPoints. */
  private pointPool_: Record<string, Point[]> = {};

  /**
   * Optimized replacement for parseFloat, which was way too slow when almost
   * all values were type number, with few edge cases, none of which were strings.
   */
  static parseFloat(val: number | null): number {
    // parseFloat(null) is NaN
    if (val === null) {
      return NaN;
    }

    // Assume it's a number or NaN. If it's something else, I'll be shocked.
    return val;
  }

  /**
   * Extracts one series from the raw data (a 2D array) into an array of the
   * unified data format.
   * This is where undesirable points (i.e. negative values on log scales) are dropped.
   *
   * @param rawData The raw data passed into zpgraph where
   *     rawData[i] = [x,ySeries1,...,ySeriesN].
   * @param seriesIndex Index of the series to extract. All other
   *     series should be ignored.
   * @param options Zpgraph options.
   * @return The series in the unified data format
   *     where series[i] = [x,y,{extras}].
   */
  abstract extractSeries(
    rawData: RawData,
    seriesIndex: number,
    options: OptionsManagerLike,
  ): UnifiedSeries;

  /**
   * Converts a series to a Point array.  The resulting point array must be
   * returned in increasing order of idx property.
   *
   * @param series The series in the unified
   *          data format where series[i] = [x,y,{extras}].
   * @param setName Name of the series.
   * @param boundaryIdStart Index offset of the first point, equal to the
   *          number of skipped points left of the date window minimum (if any).
   * @return List of points for this series.
   */
  seriesToPoints(
    series: UnifiedSeries,
    setName: string,
    boundaryIdStart: number,
  ): Point[] {
    // The points of the previous draw of this series die the moment this one
    // starts, so they are refilled instead of reallocated. Otherwise a drag over
    // a large series allocates one object per visible sample per frame, and the
    // garbage collector arrives in the middle of the gesture.
    const points: Point[] =
      this.pointPool_[setName] || (this.pointPool_[setName] = []);
    const length = series.length;

    for (let i = 0; i < length; ++i) {
      const item = series[i]!;
      const yraw = item[1];
      let point = points[i];
      if (point === undefined) {
        // canvasx/canvasy start out present so the shape never changes later,
        // which slows Chrome down.
        point = points[i] = {
          x: NaN,
          y: NaN,
          xval: NaN,
          yval: NaN,
          name: setName,
          idx: 0,
          canvasx: NaN,
          canvasy: NaN,
        };
      } else {
        point.x = NaN;
        point.y = NaN;
        point.canvasx = NaN;
        point.canvasy = NaN;
        point.name = setName;
      }
      point.xval = ZpgraphDataHandler.parseFloat(item[0]);
      point.yval = yraw === null ? null : ZpgraphDataHandler.parseFloat(yraw);
      point.idx = i + boundaryIdStart;
    }
    points.length = length;

    this.onPointsCreated_(series, points);
    return points;
  }

  /**
   * Callback called for each series after the series points have been generated
   * which will later be used by the plotters to draw the graph.
   * Here data may be added to the seriesPoints which is needed by the plotters.
   * The indexes of series and points are in sync meaning the original data
   * sample for series[i] is points[i].
   *
   * @param series The series in the unified
   *     data format where series[i] = [x,y,{extras}].
   * @param points The corresponding points passed
   *     to the plotter.
   */
  protected onPointsCreated_(_series: UnifiedSeries, _points: Point[]): void {}

  /**
   * Calculates the rolling average of a data set.
   *
   * @param series The series in the unified
   *          data format where series[i] = [x,y,{extras}].
   * @param rollPeriod The number of points over which to average the data
   * @param options The zpgraph options.
   * @param seriesIndex Index of the series this was extracted from.
   * @return the rolled series.
   */
  abstract rollingAverage(
    series: UnifiedSeries,
    rollPeriod: number,
    options: OptionsManagerLike,
    seriesIndex?: number,
  ): UnifiedSeries;

  /**
   * Computes the range of the data series (including confidence intervals).
   *
   * @param series The series in the unified
   *     data format where series[i] = [x, y, {extras}].
   * @param dateWindow The x-value range to display with
   *     the format: [min, max].
   * @param stepPlot Whether the stepPlot option is set.
   * @return The low and high extremes of the series in the
   *     given window with the format: [low, high].
   */
  abstract getExtremeYValues(
    series: UnifiedSeries,
    dateWindow?: [number, number] | null,
    stepPlot?: boolean,
  ): [number | null, number | null];

  /**
   * Callback called for each series after the layouting data has been
   * calculated before the series is drawn. Here normalized positioning data
   * should be calculated for the extras of each point.
   *
   * @param points The points passed to the plotter.
   * @param axis The axis on which the series will be plotted.
   * @param logscale Whether or not to use a logscale.
   */
  onLineEvaluated(
    _points: Point[],
    _axis: AxisProperties,
    _logscale: boolean,
  ): void {}
}

export default ZpgraphDataHandler;

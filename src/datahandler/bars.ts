"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import type { AxisProperties, UnifiedSeries } from "../internal-types";
import type { Point } from "../types";
import ZpgraphLayout from "../layout";
import ZpgraphDataHandler from "./datahandler";

/**
 * Shared base of every handler whose samples carry a low/high pair in the
 * extras. It has no data format of its own: extractSeries and rollingAverage
 * stay abstract, each bars flavour brings its own.
 */
abstract class BarsHandler extends ZpgraphDataHandler {
  /** @inheritDoc */
  protected override onPointsCreated_(
    series: UnifiedSeries,
    points: Point[],
  ): void {
    for (let i = 0; i < series.length; ++i) {
      const item = series[i] as [number, number | null, (number | null)[]];
      const point = points[i]!;
      point.y_top = NaN;
      point.y_bottom = NaN;
      point.yval_minus = ZpgraphDataHandler.parseFloat(item[2][0] ?? null);
      point.yval_plus = ZpgraphDataHandler.parseFloat(item[2][1] ?? null);
    }
  }

  /** @inheritDoc */
  override getExtremeYValues(
    series: UnifiedSeries,
    dateWindow?: [number, number] | null,
    stepPlot?: boolean,
  ): [number | null, number | null] {
    let minY: number | null = null,
      maxY: number | null = null,
      y;

    let firstIdx = 0;
    let lastIdx = series.length - 1;

    for (let j = firstIdx; j <= lastIdx; j++) {
      const row = series[j]!;
      y = row[1];
      if (y === null || isNaN(y)) continue;

      let extras = row[2] as number[];
      let low = extras[0]!;
      let high = extras[1]!;

      if (low > y) low = y; // this can happen with custom bars,
      if (high < y) high = y; // e.g. in tests/custom-bars.html

      if (maxY === null || high > maxY) maxY = high;
      if (minY === null || low < minY) minY = low;
    }

    return [minY, maxY];
  }

  /** @inheritDoc */
  override onLineEvaluated(
    points: Point[],
    axis: AxisProperties,
    logscale: boolean,
  ): void {
    for (let j = 0; j < points.length; j++) {
      // Copy over the error terms
      const point = points[j]!;
      point.y_top = ZpgraphLayout.calcYNormal_(
        axis,
        point.yval_minus,
        logscale,
      );
      point.y_bottom = ZpgraphLayout.calcYNormal_(
        axis,
        point.yval_plus,
        logscale,
      );
    }
  }
}

export default BarsHandler;

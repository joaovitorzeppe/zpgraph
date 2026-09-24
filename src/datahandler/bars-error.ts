"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import type {
  OptionsManagerLike,
  RawData,
  UnifiedSeries,
} from "../internal-types";
import BarsHandler from "./bars";
import { rawX, rawYArray, seriesBoolean, seriesNumber } from "./datahandler";
import { slideRoll } from "./roll";

class ErrorBarsHandler extends BarsHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series: UnifiedSeries = [];
    let x, y, variance, point;
    const logScale = seriesBoolean(options, i, "logscale");
    const sigma = seriesNumber(options, i, "sigma");
    for (let j = 0; j < rawData.length; j++) {
      x = rawX(rawData[j]![0]!);
      point = rawYArray(rawData[j]![i]!);
      if (logScale && point !== null) {
        // On the log scale, points less than zero do not exist.
        // This will create a gap in the chart.
        if (point[0]! <= 0 || point[0]! - sigma * point[1]! <= 0) {
          point = null;
        }
      }
      // Extract to the unified data format.
      if (point !== null) {
        y = point[0]!;
        if (y !== null && !isNaN(y)) {
          variance = sigma * point[1]!;
          // preserve original error value in extras for further
          // filtering
          series[j] = [x, y, [y - variance, y + variance, point[1]!]];
        } else {
          series[j] = [x, y, [y, y, y]];
        }
      } else {
        series[j] = [x, null, [null, null, null]];
      }
    }
    return series;
  }

  /** @inheritDoc */
  override rollingAverage(
    originalData: UnifiedSeries,
    rollPeriod: number,
    options: OptionsManagerLike,
    seriesIndex_ = 0,
  ): UnifiedSeries {
    rollPeriod = Math.min(rollPeriod, originalData.length);
    const rollingData: UnifiedSeries = [];
    const sigma = seriesNumber(options, seriesIndex_, "sigma");

    slideRoll(
      originalData.length,
      rollPeriod,
      (index) => originalData[index]![1],
      (index) => Math.pow(originalData[index]![2]![2]!, 2),
      (index, sum, count, variance) => {
        if (count) {
          const stddev = Math.sqrt(variance) / count;
          const value = sum / count;
          rollingData[index] = [
            originalData[index]![0],
            value,
            [value - sigma * stddev, value + sigma * stddev],
          ];
          return;
        }
        const v = rollPeriod === 1 ? originalData[index]![1] : null;
        rollingData[index] = [originalData[index]![0], v, [v, v]];
      },
    );

    return rollingData;
  }
}

export default ErrorBarsHandler;

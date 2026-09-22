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

class FractionsBarsHandler extends BarsHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series: UnifiedSeries = [];
    let x, y, point, num, den, value, stddev, variance;
    const mult = 100.0;
    const logScale = seriesBoolean(options, i, "logscale");
    const sigma = seriesNumber(options, i, "sigma");
    for (let j = 0; j < rawData.length; j++) {
      x = rawX(rawData[j]![0]!);
      point = rawYArray(rawData[j]![i]!);
      if (logScale && point !== null) {
        // On the log scale, points less than zero do not exist.
        // This will create a gap in the chart.
        if (point[0]! <= 0 || point[1]! <= 0) {
          point = null;
        }
      }
      // Extract to the unified data format.
      if (point !== null) {
        num = point[0]!;
        den = point[1]!;
        if (num !== null && !isNaN(num)) {
          value = den ? num / den : 0.0;
          stddev = den ? sigma * Math.sqrt((value * (1 - value)) / den) : 1.0;
          variance = mult * stddev;
          y = mult * value;
          // preserve original values in extras for further filtering
          series[j] = [x, y, [y - variance, y + variance, num, den]];
        } else {
          series[j] = [x, num, [num, num, num, den]];
        }
      } else {
        series[j] = [x, null, [null, null, null, null]];
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
    const wilsonInterval = seriesBoolean(
      options,
      seriesIndex_,
      "wilsonInterval",
    );

    let low, high, i, stddev;
    let num = 0;
    let den = 0; // numerator/denominator
    const mult = 100.0;
    for (i = 0; i < originalData.length; i++) {
      num += originalData[i]![2]![2]!;
      den += originalData[i]![2]![3]!;
      if (i - rollPeriod >= 0) {
        num -= originalData[i - rollPeriod]![2]![2]!;
        den -= originalData[i - rollPeriod]![2]![3]!;
      }

      const date = originalData[i]![0];
      const value = den ? num / den : 0.0;
      if (wilsonInterval) {
        // For more details on this confidence interval, see:
        // https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval
        if (den) {
          const p = value < 0 ? 0 : value,
            n = den;
          const pm =
            sigma *
            Math.sqrt((p * (1 - p)) / n + (sigma * sigma) / (4 * n * n));
          const denom = 1 + (sigma * sigma) / den;
          low = (p + (sigma * sigma) / (2 * den) - pm) / denom;
          high = (p + (sigma * sigma) / (2 * den) + pm) / denom;
          rollingData[i] = [date, p * mult, [low * mult, high * mult]];
        } else {
          rollingData[i] = [date, 0, [0, 0]];
        }
      } else {
        stddev = den ? sigma * Math.sqrt((value * (1 - value)) / den) : 1.0;
        rollingData[i] = [
          date,
          mult * value,
          [mult * (value - stddev), mult * (value + stddev)],
        ];
      }
    }

    return rollingData;
  }
}

export default FractionsBarsHandler;

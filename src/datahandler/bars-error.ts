'use strict';

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
} from '../internal-types';
import BarsHandler from './bars';
import { seriesOption } from './datahandler';

class ErrorBarsHandler extends BarsHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series = Array.from({ length: rawData.length }) as UnifiedSeries;
    let x, y, variance, point;
    const logScale = seriesOption<boolean>(options, i, 'logscale');
    const sigma = seriesOption<number>(options, i, 'sigma');
    for (let j = 0; j < rawData.length; j++) {
      x = rawData[j]![0] as number;
      point = rawData[j]![i] as number[] | null;
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
    const sigma = seriesOption<number>(options, seriesIndex_, 'sigma');

    let i, j, y, v, sum, num_ok, stddev, variance, value;

    // Calculate the rolling average for the first rollPeriod - 1 points
    // where there is not enough data to roll over the full number of points
    for (i = 0; i < originalData.length; i++) {
      sum = 0;
      variance = 0;
      num_ok = 0;
      for (j = Math.max(0, i - rollPeriod + 1); j < i + 1; j++) {
        y = originalData[j]![1];
        if (y === null || isNaN(y)) {continue;}
        num_ok++;
        sum += y;
        variance += Math.pow((originalData[j]![2] as number[])[2]!, 2);
      }
      if (num_ok) {
        stddev = Math.sqrt(variance) / num_ok;
        value = sum / num_ok;
        rollingData[i] = [
          originalData[i]![0],
          value,
          [value - sigma * stddev, value + sigma * stddev],
        ];
      } else {
        // This explicitly preserves NaNs to aid with "independent
        // series".
        // See testRollingAveragePreservesNaNs.
        v = rollPeriod === 1 ? originalData[i]![1] : null;
        rollingData[i] = [originalData[i]![0], v, [v, v]];
      }
    }

    return rollingData;
  }
}

export default ErrorBarsHandler;

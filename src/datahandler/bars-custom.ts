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

class CustomBarsHandler extends BarsHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series = Array.from({ length: rawData.length }) as UnifiedSeries;
    let x, y, point;
    const logScale = seriesOption<boolean>(options, i, 'logscale');
    for (let j = 0; j < rawData.length; j++) {
      x = rawData[j]![0] as number;
      point = rawData[j]![i] as number[] | null;
      if (logScale && point !== null) {
        // On the log scale, points less than zero do not exist.
        // This will create a gap in the chart.
        if (point[0]! <= 0 || point[1]! <= 0 || point[2]! <= 0) {
          point = null;
        }
      }
      // Extract to the unified data format.
      if (point !== null) {
        y = point[1]!;
        if (y !== null && !isNaN(y)) {
          series[j] = [x, y, [point[0]!, point[2]!]];
        } else {
          series[j] = [x, y, [y, y]];
        }
      } else {
        series[j] = [x, null, [null, null]];
      }
    }
    return series;
  }

  /** @inheritDoc */
  override rollingAverage(
    originalData: UnifiedSeries,
    rollPeriod: number,
    options?: OptionsManagerLike,
    seriesIndex_?: number,
  ): UnifiedSeries {
    rollPeriod = Math.min(rollPeriod, originalData.length);
    const rollingData: UnifiedSeries = [];
    let y, low, high, mid, count, i, extremes;

    low = 0;
    mid = 0;
    high = 0;
    count = 0;
    for (i = 0; i < originalData.length; i++) {
      y = originalData[i]![1];
      extremes = originalData[i]![2] as number[];
      rollingData[i] = originalData[i]!;

      if (y !== null && !isNaN(y)) {
        low += extremes[0]!;
        mid += y;
        high += extremes[1]!;
        count += 1;
      }
      if (i - rollPeriod >= 0) {
        const prev = originalData[i - rollPeriod]!;
        if (prev[1]! !== null && !isNaN(prev[1]!)) {
          low -= (prev[2]! as number[])[0]!;
          mid -= prev[1]!;
          high -= (prev[2]! as number[])[1]!;
          count -= 1;
        }
      }
      if (count) {
        rollingData[i] = [
          originalData[i]![0],
          (1.0 * mid) / count,
          [(1.0 * low) / count, (1.0 * high) / count],
        ];
      } else {
        rollingData[i] = [originalData[i]![0], null, [null, null]];
      }
    }

    return rollingData;
  }
}

export default CustomBarsHandler;

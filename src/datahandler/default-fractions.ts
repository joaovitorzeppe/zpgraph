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
import { seriesOption } from "./datahandler";
import DefaultHandler from "./default";

class DefaultFractionHandler extends DefaultHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series = Array.from({ length: rawData.length }) as UnifiedSeries;
    let x, y, point, num, den, value;
    const mult = 100.0;
    const logScale = seriesOption<boolean>(options, i, "logscale");
    for (let j = 0; j < rawData.length; j++) {
      x = rawData[j]![0] as number;
      point = rawData[j]![i] as number[] | null;
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
          y = mult * value;
          // preserve original values in extras for further filtering
          series[j] = [x, y, [num, den]];
        } else {
          series[j] = [x, num, [num, den]];
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

    let i;
    let num = 0;
    let den = 0; // numerator/denominator
    const mult = 100.0;
    for (i = 0; i < originalData.length; i++) {
      num += (originalData[i]![2] as number[])[0]!;
      den += (originalData[i]![2] as number[])[1]!;
      if (i - rollPeriod >= 0) {
        num -= (originalData[i - rollPeriod]![2] as number[])[0]!;
        den -= (originalData[i - rollPeriod]![2] as number[])[1]!;
      }

      const date = originalData[i]![0];
      const value = den ? num / den : 0.0;
      rollingData[i] = [date, mult * value];
    }

    return rollingData;
  }
}

export default DefaultFractionHandler;

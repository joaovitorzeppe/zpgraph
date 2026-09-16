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
import ZpgraphDataHandler, { seriesOption } from "./datahandler";

class DefaultHandler extends ZpgraphDataHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series = new Array(rawData.length);
    const logScale = seriesOption<boolean>(options, i, "logscale");
    for (let j = 0; j < rawData.length; j++) {
      const row = rawData[j]!;
      let x = row[0] as number;
      let point = row[i] as number | null;
      if (logScale) {
        // On the log scale, points less than zero do not exist.
        // This will create a gap in the chart.
        if (point !== null && point <= 0) {
          point = null;
        }
      }
      series[j] = [x, point];
    }
    return series;
  }

  /** @inheritDoc */
  override rollingAverage(
    originalData: UnifiedSeries,
    rollPeriod: number,
    options: OptionsManagerLike,
    seriesIndex_?: number,
  ): UnifiedSeries {
    rollPeriod = Math.min(rollPeriod, originalData.length);
    const rollingData: UnifiedSeries = [];

    let i, j, y, sum, num_ok;
    // Calculate the rolling average for the first rollPeriod - 1 points
    // where
    // there is not enough data to roll over the full number of points
    if (rollPeriod === 1) {
      return originalData;
    }
    for (i = 0; i < originalData.length; i++) {
      sum = 0;
      num_ok = 0;
      for (j = Math.max(0, i - rollPeriod + 1); j < i + 1; j++) {
        y = originalData[j]![1];
        if (y === null || isNaN(y)) continue;
        num_ok++;
        sum += y;
      }
      if (num_ok) {
        rollingData[i] = [originalData[i]![0], sum / num_ok];
      } else {
        rollingData[i] = [originalData[i]![0], null];
      }
    }

    return rollingData;
  }

  /** @inheritDoc */
  override getExtremeYValues(
    series: UnifiedSeries,
    dateWindow?: [number, number] | null,
    stepPlot?: boolean,
  ): [number | null, number | null] {
    let minY = null,
      maxY = null,
      y;
    let firstIdx = 0,
      lastIdx = series.length - 1;

    for (let j = firstIdx; j <= lastIdx; j++) {
      y = series[j]![1];
      if (y === null || isNaN(y)) continue;
      if (maxY === null || y > maxY) {
        maxY = y;
      }
      if (minY === null || y < minY) {
        minY = y;
      }
    }
    return [minY, maxY];
  }
}

export default DefaultHandler;

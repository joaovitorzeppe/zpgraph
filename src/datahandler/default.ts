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
import ZpgraphDataHandler, { rawX, rawY, seriesBoolean } from "./datahandler";
import { slideRoll } from "./roll";

class DefaultHandler extends ZpgraphDataHandler {
  /** @inheritDoc */
  override extractSeries(
    rawData: RawData,
    i: number,
    options: OptionsManagerLike,
  ): UnifiedSeries {
    const series: UnifiedSeries = [];
    const logScale = seriesBoolean(options, i, "logscale");
    for (let j = 0; j < rawData.length; j++) {
      const row = rawData[j]!;
      const x = rawX(row[0]!);
      let point = rawY(row[i]!);
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
    if (rollPeriod === 1) {
      return originalData;
    }
    const rollingData: UnifiedSeries = [];
    slideRoll(
      originalData.length,
      rollPeriod,
      (index) => originalData[index]![1],
      null,
      (index, sum, count) => {
        rollingData[index] = [
          originalData[index]![0],
          count ? sum / count : null,
        ];
      },
    );
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
    const firstIdx = 0,
      lastIdx = series.length - 1;

    for (let j = firstIdx; j <= lastIdx; j++) {
      y = series[j]![1];
      if (y === null || isNaN(y)) {
        continue;
      }
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

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import DefaultHandler from "../datahandler/default";
import type {
  DataHandlerLike,
  PluginEventBase,
  UnifiedSeries,
  ZpgraphInstance,
} from "../internal-types";
import * as utils from "../utils";
import type ZpgraphClass from "../zpgraph";
import type { AxisLabelFormatter, Point, ValueFormatter } from "../types";

type RebaseBase = "percent" | number;

const usableInitial = (initial: number | null): initial is number =>
  initial !== null && Number.isFinite(initial) && initial !== 0;

const isAxisLabelFormatter = (v: unknown): v is AxisLabelFormatter =>
  typeof v === "function";

const isValueFormatter = (v: unknown): v is ValueFormatter =>
  typeof v === "function";

class RebaseHandler extends DefaultHandler {
  baseOpt: RebaseBase;

  constructor(baseOpt: RebaseBase) {
    super();
    this.baseOpt = baseOpt;
  }

  static rebase(
    value: number | null,
    initial: number | null,
    base: RebaseBase,
  ): number | null {
    if (
      value === null ||
      !Number.isFinite(value) ||
      !usableInitial(initial)
    ) {
      return null;
    }
    if (base === "percent") {
      return (value / initial - 1) * 100;
    }
    return (value * base) / initial;
  }

  override getExtremeYValues(
    series: UnifiedSeries,
    dateWindow?: [number, number] | null,
    _stepPlot?: boolean,
  ): [number | null, number | null] {
    let minY = null,
      maxY = null,
      y;
    let firstIdx = 0;
    let lastIdx = series.length - 1;
    if (dateWindow && series.length) {
      firstIdx = utils.lowerBoundX(series, dateWindow[0]);
      lastIdx = utils.upperBoundX(series, dateWindow[1]);
      if (firstIdx >= series.length) {
        firstIdx = series.length - 1;
      }
      if (lastIdx < 0) {
        lastIdx = 0;
      }
      if (lastIdx < firstIdx) {
        lastIdx = firstIdx;
      }
    }
    // Rebase always uses the first sample of the full series as the base.
    const initial = series[0]![1];
    if (!usableInitial(initial)) {
      return [null, null];
    }

    for (let j = firstIdx; j <= lastIdx; j++) {
      if (j === 0) {
        y = this.baseOpt === "percent" ? 0 : this.baseOpt;
      } else {
        y = RebaseHandler.rebase(series[j]![1], initial, this.baseOpt);
      }
      if (y === null || Number.isNaN(y)) {
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

  override seriesToPoints(
    series: UnifiedSeries,
    setName: string,
    boundaryIdStart: number,
    fromIdx = 0,
    toIdxInclusive = series.length - 1,
  ): Point[] {
    const points: Point[] = [];
    const start = Math.max(0, fromIdx);
    const end = Math.min(series.length - 1, toIdxInclusive);
    const initial = series[0]?.[1] ?? null;
    const initialOk = usableInitial(initial);
    for (let i = 0; start + i <= end; ++i) {
      const src = start + i;
      const item = series[src]!;
      const yraw = item[1];
      let yval = yraw;
      if (!initialOk) {
        yval = null;
      } else if (yval !== null) {
        if (src === 0) {
          yval = this.baseOpt === "percent" ? 0 : this.baseOpt;
        } else {
          yval = RebaseHandler.rebase(yval, initial, this.baseOpt);
        }
      }
      points.push({
        x: NaN,
        y: NaN,
        xval: item[0],
        yval: yval,
        name: setName,
        idx: i + boundaryIdStart,
        canvasx: NaN,
        canvasy: NaN,
      });
    }
    const windowed =
      start === 0 && end === series.length - 1
        ? series
        : series.slice(start, end + 1);
    this.onPointsCreated_(windowed, points);
    return points;
  }
}


const isNumericBase = (v: unknown): v is number =>
  !isNaN(Number(v)) &&
  (typeof v === "number" || {}.toString.call(v) === "[object Number]");

class Rebase {
  baseOpt_: RebaseBase | null;
  g_: ZpgraphInstance | null = null;
  prevDataHandler_: DataHandlerLike | null = null;
  replacedHandler_ = false;
  formattersApplied_ = false;
  axisFormatter_: AxisLabelFormatter | null = null;
  valueFormatter_: ValueFormatter | null = null;
  prevAxisFormatter_: unknown;
  prevValueFormatter_: unknown;

  constructor(baseOpt?: unknown) {
    this.baseOpt_ =
      baseOpt === "percent" || isNumericBase(baseOpt) ? baseOpt : null;
  }

  toString() {
    return "Rebase Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g;
    if (this.baseOpt_ === null) {
      return undefined;
    }
    return {
      predraw: this.predraw,
    };
  }

  predraw(e: PluginEventBase) {
    const g = e.zpgraph;
    const base = this.baseOpt_;
    if (base === null) {
      return;
    }
    this.g_ = g;

    if (base === "percent") {
      const current = g.getOptionForAxis("axisLabelFormatter", "y");
      if (current !== this.axisFormatter_) {
        if (!this.formattersApplied_) {
          this.prevAxisFormatter_ = current;
          this.prevValueFormatter_ = g.getOptionForAxis("valueFormatter", "y");
        }
        this.axisFormatter_ = (y) =>
          (typeof y === "number" ? y : y.getTime()) + "%";
        this.valueFormatter_ = (y) => Math.round(y * 100) / 100 + "%";
        g.updateOptions(
          {
            axes: {
              y: {
                axisLabelFormatter: this.axisFormatter_,
                valueFormatter: this.valueFormatter_,
              },
            },
          },
          true,
        );
        this.formattersApplied_ = true;
      }
    }

    this.prevDataHandler_ = g.dataHandler_;
    this.replacedHandler_ = true;
    g.dataHandler_ = new RebaseHandler(base);
  }

  destroy() {
    const g = this.g_;
    if (!g) {
      return;
    }
    if (this.replacedHandler_ && this.prevDataHandler_) {
      g.dataHandler_ = this.prevDataHandler_;
    }
    if (this.formattersApplied_) {
      const y = g.user_attrs_.axes?.y;
      if (y) {
        if (isAxisLabelFormatter(this.prevAxisFormatter_)) {
          y.axisLabelFormatter = this.prevAxisFormatter_;
        } else {
          delete y.axisLabelFormatter;
        }
        if (isValueFormatter(this.prevValueFormatter_)) {
          y.valueFormatter = this.prevValueFormatter_;
        } else {
          delete y.valueFormatter;
        }
      }
      g.updateOptions({}, true);
      this.formattersApplied_ = false;
    }
    this.replacedHandler_ = false;
    this.prevDataHandler_ = null;
    this.axisFormatter_ = null;
    this.valueFormatter_ = null;
    this.g_ = null;
  }
}


export default Rebase;
export { RebaseHandler };

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
    _dateWindow?: [number, number] | null,
    _stepPlot?: boolean,
  ): [number | null, number | null] {
    let minY = null,
      maxY = null,
      y;
    const firstIdx = 0,
      lastIdx = series.length - 1;
    const initial = series[firstIdx]![1];
    if (!usableInitial(initial)) {
      return [null, null];
    }

    for (let j = firstIdx; j <= lastIdx; j++) {
      if (j === firstIdx) {
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
  ): Point[] {
    const points: Point[] = [];
    const firstIdx = 0;
    const lastIdx = series.length - 1;
    const initial = series[firstIdx]![1];
    const initialOk = usableInitial(initial);
    for (let i = 0; i <= lastIdx; ++i) {
      const item = series[i]!;
      const yraw = item[1];
      let yval = yraw;
      if (!initialOk) {
        yval = null;
      } else if (yval !== null) {
        if (i === firstIdx) {
          yval = this.baseOpt === "percent" ? 0 : this.baseOpt;
        } else {
          yval = RebaseHandler.rebase(yval, initial, this.baseOpt);
        }
      }
      const point = {
        x: NaN,
        y: NaN,
        xval: item[0],
        yval: yval,
        name: setName,
        idx: i + boundaryIdStart,
      };
      points.push(point);
    }
    this.onPointsCreated_(series, points);
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

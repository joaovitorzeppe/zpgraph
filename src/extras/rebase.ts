/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZpgraphImport from "zpgraph";
import DefaultHandler from "../datahandler/default";
import type { PluginEventBase, UnifiedSeries } from "../internal-types";
import type ZpgraphClass from "../zpgraph";
import type { Point } from "../types";

type RebaseBase = "percent" | number;

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  Plugins: Record<string, unknown>;
  DataHandlers: Record<string, unknown> & {
    RebaseHandler?: typeof RebaseHandler;
  };
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;
Zpgraph.Plugins = Zpgraph.Plugins || {};

// Matches DefaultHandler.parseFloat
const parseFloat = (val: number | null) => {
  if (val === null) return NaN;
  return val;
};

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
  ): number {
    if (value === null || initial === null) return NaN;
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
    let firstIdx = 0,
      lastIdx = series.length - 1;
    let initial = series[firstIdx]![1];

    for (let j = firstIdx; j <= lastIdx; j++) {
      if (j === firstIdx) {
        y = this.baseOpt === "percent" ? 0 : this.baseOpt;
      } else {
        y = RebaseHandler.rebase(series[j]![1], initial, this.baseOpt);
      }
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

  override seriesToPoints(
    series: UnifiedSeries,
    setName: string,
    boundaryIdStart: number,
  ): Point[] {
    const points: Point[] = [];
    let firstIdx = 0;
    let lastIdx = series.length - 1;
    let initial = series[firstIdx]![1];
    for (let i = 0; i <= lastIdx; ++i) {
      let item = series[i]!;
      let yraw = item[1];
      let yval = yraw === null ? null : parseFloat(yraw);
      if (yval !== null) {
        if (i === firstIdx) {
          yval = this.baseOpt === "percent" ? 0 : this.baseOpt;
        } else {
          yval = RebaseHandler.rebase(yval, initial, this.baseOpt);
        }
      }
      let point = {
        x: NaN,
        y: NaN,
        xval: parseFloat(item[0]),
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

Zpgraph.DataHandlers.RebaseHandler = RebaseHandler;

const isNumericBase = (v: unknown): v is number =>
  !isNaN(Number(v)) &&
  (typeof v === "number" || {}.toString.call(v) === "[object Number]");

class Rebase {
  baseOpt_: RebaseBase | null;

  constructor(baseOpt?: unknown) {
    this.baseOpt_ =
      baseOpt === "percent" || isNumericBase(baseOpt) ? baseOpt : null;
  }

  toString() {
    return "Rebase Plugin";
  }

  activate(_g: ZpgraphClass) {
    if (this.baseOpt_ === null) {
      return;
    }
    return {
      predraw: this.predraw,
    };
  }

  predraw(e: PluginEventBase) {
    let g = e.zpgraph;

    if (this.baseOpt_ === "percent") {
      g.updateOptions(
        {
          axes: {
            y: {
              axisLabelFormatter: (y: number | Date) =>
                (typeof y === "number" ? y : y.getTime()) + "%",
              valueFormatter: (y: number) => Math.round(y * 100) / 100 + "%",
            },
          },
        },
        true,
      );
    }

    g.dataHandler_ = new RebaseHandler(this.baseOpt_!);
  }
}

Zpgraph.Plugins.Rebase = Rebase;

export default Rebase;
export { RebaseHandler };

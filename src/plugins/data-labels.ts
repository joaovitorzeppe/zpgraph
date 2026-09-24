/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { DataLabelsOptions, Point } from "../types";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readDataLabelsOptions = (v: unknown): DataLabelsOptions | undefined => {
  if (!isPlainObject(v)) {
    return undefined;
  }
  const out: DataLabelsOptions = {};
  const enabled = Reflect.get(v, "enabled");
  if (typeof enabled === "boolean") {
    out.enabled = enabled;
  }
  const filter = Reflect.get(v, "filter");
  if (isPlainObject(filter)) {
    const every = Reflect.get(filter, "every");
    const minDistancePx = Reflect.get(filter, "minDistancePx");
    out.filter = {};
    if (typeof every === "number") {
      out.filter.every = every;
    }
    if (typeof minDistancePx === "number") {
      out.filter.minDistancePx = minDistancePx;
    }
  }
  const formatter = Reflect.get(v, "formatter");
  if (typeof formatter === "function") {
    out.formatter = (yval: number | null | undefined, p: Point) => {
      const result: unknown = Reflect.apply(formatter, undefined, [yval, p]);
      return typeof result === "string" ? result : String(result);
    };
  }
  return out;
};

class data_labels {
  toString() {
    return "Data Labels Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      didDrawChart: this.didDrawChart,
    };
  }

  destroy() {}

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    const opts = readDataLabelsOptions(g.getOption("dataLabels"));
    if (!opts?.enabled) {
      return;
    }

    const every = opts.filter?.every ?? 1;
    const minDist = opts.filter?.minDistancePx ?? 40;
    const ctx = e.drawingContext;
    const sets = g.layout_.points;
    if (!sets?.length) {
      return;
    }

    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (const pts of sets) {
      let lastX = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (i % every !== 0) {
          continue;
        }
        const p = pts[i]!;
        if (p.canvasx == null || p.canvasy == null || p.yval == null) {
          continue;
        }
        if (p.canvasx - lastX < minDist) {
          continue;
        }
        lastX = p.canvasx;
        const text = opts.formatter
          ? opts.formatter(p.yval, p)
          : String(p.yval);
        ctx.fillText(text, p.canvasx, p.canvasy - 4);
      }
    }
    ctx.restore();
  }
}

export default data_labels;

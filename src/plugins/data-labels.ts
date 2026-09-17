/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { DataLabelsOptions, Point } from "../types";
import type Zpgraph from "../zpgraph";

class data_labels {
  toString() {
    return "Data Labels Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      didDrawChart: this.didDrawChart,
    };
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph as unknown as Zpgraph;
    const opts = g.getOption("dataLabels") as DataLabelsOptions | undefined;
    if (!opts?.enabled) return;

    const every = opts.filter?.every ?? 1;
    const minDist = opts.filter?.minDistancePx ?? 40;
    const ctx = e.drawingContext;
    const sets = g.layout_.points as Point[][] | undefined;
    if (!sets?.length) return;

    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (const pts of sets) {
      let lastX = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (i % every !== 0) continue;
        const p = pts[i]!;
        if (p.canvasx == null || p.canvasy == null || p.yval == null) continue;
        if (p.canvasx - lastX < minDist) continue;
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

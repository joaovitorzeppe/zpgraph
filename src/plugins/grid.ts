"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import { halfDown, halfUp } from "../utils";

const toNumberArrayOrNull = (v: unknown): number[] | null => {
  if (v == null) {
    return null;
  }
  if (!Array.isArray(v)) {
    return null;
  }
  return v.every((x) => typeof x === "number") ? v : null;
};

/*

Current bits of jankiness:
- Direct layout access
- Direct area access

*/

/**
 * Draws the gridlines, i.e. the gray horizontal & vertical lines running the
 * length of the chart.
 *
 * @constructor
 */
class grid {
  toString() {
    return "Gridline Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      willDrawChart: this.willDrawChart,
    };
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    // Draw the new X/Y grid. Lines appear crisper when pixels are rounded to
    // half-integers. This prevents them from drawing in two rows/cols.
    const g = e.zpgraph;
    const ctx = e.drawingContext;
    const layout = g.layout_;
    const area = e.zpgraph.plotter_.area;

    let x: number;
    let y: number;
    let i: number;
    const yticks = layout.yticks ?? [];
    const xticks = layout.xticks ?? [];
    // Either y axis can carry a grid on its own: the per-axis drawGrid below
    // decides which ones are drawn.
    if (
      g.getOptionForAxis("drawGrid", "y") ||
      g.getOptionForAxis("drawGrid", "y2")
    ) {
      const axes = ["y", "y2"];
      const strokeStyles: string[] = [],
        lineWidths: number[] = [],
        drawGrid: boolean[] = [],
        stroking: boolean[] = [],
        strokePattern: Array<number[] | null> = [];
      for (i = 0; i < axes.length; i++) {
        drawGrid[i] = !!g.getOptionForAxis("drawGrid", axes[i]!);
        if (drawGrid[i]) {
          strokeStyles[i] = String(
            g.getOptionForAxis("gridLineColor", axes[i]!),
          );
          lineWidths[i] = Number(g.getOptionForAxis("gridLineWidth", axes[i]!));
          strokePattern[i] = toNumberArrayOrNull(
            g.getOptionForAxis("gridLinePattern", axes[i]!),
          );
          stroking[i] = !!(strokePattern[i] && strokePattern[i]!.length >= 2);
        }
      }
      ctx.save();
      // One path per axis rather than one per tick: every line on an axis shares
      // a style, so they can all be stroked together.
      for (i = 0; i < axes.length; i++) {
        if (!drawGrid[i]) {
          continue;
        }
        ctx.save();
        if (stroking[i]) {
          if (ctx.setLineDash && strokePattern[i]) {
            ctx.setLineDash(strokePattern[i]!);
          }
        }
        ctx.strokeStyle = strokeStyles[i]!;
        ctx.lineWidth = lineWidths[i]!;

        ctx.beginPath();
        x = halfUp(area.x);
        for (const tick of yticks) {
          if (!tick.has_tick || tick.axis !== i) {
            continue;
          }
          y = halfDown(area.y + tick.pos * area.h);
          ctx.moveTo(x, y);
          ctx.lineTo(x + area.w, y);
        }
        ctx.stroke();

        ctx.restore();
      }
      ctx.restore();
    }

    // draw grid for x axis
    if (g.getOptionForAxis("drawGrid", "x")) {
      ctx.save();
      const xStrokePattern = toNumberArrayOrNull(
        g.getOptionForAxis("gridLinePattern", "x"),
      );
      const xStroking = !!(xStrokePattern && xStrokePattern.length >= 2);
      if (xStroking) {
        if (ctx.setLineDash) {
          ctx.setLineDash(xStrokePattern);
        }
      }
      ctx.strokeStyle = String(g.getOptionForAxis("gridLineColor", "x"));
      ctx.lineWidth = Number(g.getOptionForAxis("gridLineWidth", "x"));
      ctx.beginPath();
      y = halfDown(area.y + area.h);
      for (const tick of xticks) {
        if (!tick.has_tick) {
          continue;
        }
        x = halfUp(area.x + tick.pos * area.w);
        ctx.moveTo(x, y);
        ctx.lineTo(x, area.y);
      }
      ctx.stroke();
      if (xStroking) {
        if (ctx.setLineDash) {
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }
  }

  destroy() {}
}

export default grid;

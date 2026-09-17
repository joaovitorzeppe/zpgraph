/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { ThresholdBand } from "../types";

class thresholds {
  toString() {
    return "Thresholds Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      willDrawChart: this.willDrawChart,
    };
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    const list = g.getOption("thresholds") as ThresholdBand[] | undefined;
    if (!list || !list.length) return;

    const ctx = e.drawingContext;
    const area = g.plotter_.area;

    for (const band of list) {
      const axisIdx = band.axis === "y2" ? 1 : 0;
      const yLo =
        band.yRange?.[0] ??
        (band.y2 != null && band.y != null
          ? Math.min(band.y, band.y2)
          : (band.y ?? undefined));
      const yHi =
        band.yRange?.[1] ??
        (band.y2 != null && band.y != null
          ? Math.max(band.y, band.y2)
          : (band.y2 ?? band.y ?? undefined));
      if (yLo == null && yHi == null) continue;

      const domLo =
        yLo != null ? g.toDomYCoord(yLo, axisIdx) : null;
      const domHi =
        yHi != null ? g.toDomYCoord(yHi, axisIdx) : null;

      ctx.save();
      if (domLo != null && domHi != null && domLo !== domHi) {
        const top = Math.min(domLo, domHi);
        const h = Math.abs(domHi - domLo);
        ctx.fillStyle =
          band.fillColor ?? "var(--zp-threshold-fill, rgba(27,107,147,0.14))";
        // Canvas cannot resolve CSS vars — use fallback rgba when var-like.
        if (String(ctx.fillStyle).startsWith("var(")) {
          ctx.fillStyle = "rgba(27,107,147,0.14)";
        }
        if (band.fillColor) ctx.fillStyle = band.fillColor;
        ctx.fillRect(area.x, top, area.w, h);
      }

      const stroke = band.color ?? "#1b6b93";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = band.strokeWidth ?? 1;
      ctx.beginPath();
      if (domHi != null) {
        ctx.moveTo(area.x, domHi);
        ctx.lineTo(area.x + area.w, domHi);
      }
      if (domLo != null && domLo !== domHi) {
        ctx.moveTo(area.x, domLo);
        ctx.lineTo(area.x + area.w, domLo);
      }
      ctx.stroke();

      if (band.label && (domHi != null || domLo != null)) {
        const yLabel = domHi ?? domLo!;
        ctx.fillStyle = stroke;
        ctx.font = "12px sans-serif";
        ctx.textBaseline = "bottom";
        const xLabel =
          band.labelPosition === "right" ? area.x + area.w - 4 : area.x + 4;
        ctx.textAlign = band.labelPosition === "right" ? "right" : "left";
        ctx.fillText(band.label, xLabel, yLabel - 2);
      }
      ctx.restore();
    }
  }
}

export default thresholds;

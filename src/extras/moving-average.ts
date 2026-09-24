/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ZpgraphInstance } from "../internal-types";
import type { Plotter, PlotterEvent } from "../types";

type MovingAveragePlotter = Plotter & { period: number; color?: string };

export type MovingAverageOptions = {
  /** Window size in points. Default 7. */
  period?: number;
  /** Limit to one series name; omit for all. */
  series?: string;
  /** Stroke color; default semi-transparent accent. */
  color?: string;
  strokeWidth?: number;
};

const isChartHost = (
  v: unknown,
): v is Pick<
  ZpgraphInstance,
  "toDomYCoord" | "getPropertiesForSeries" | "yAxisRange"
> =>
  typeof v === "object" &&
  v !== null &&
  typeof Reflect.get(v, "toDomYCoord") === "function" &&
  typeof Reflect.get(v, "getPropertiesForSeries") === "function" &&
  typeof Reflect.get(v, "yAxisRange") === "function";

/**
 * Overlay plotter: draws a rolling-average curve on top of the series.
 * Compose with Zpgraph.Plotters.linePlotter (does not replace rollPeriod).
 *
 *   plotter: [
 *     Zpgraph.Plotters.fillPlotter,
 *     Zpgraph.Plotters.errorPlotter,
 *     Zpgraph.Plotters.linePlotter,
 *     createMovingAveragePlotter({ period: 7 }),
 *   ]
 */
export const createMovingAveragePlotter = (
  opts: MovingAverageOptions = {},
): Plotter => {
  const period = Math.max(1, opts.period ?? 7);
  const seriesFilter = opts.series;
  const color = opts.color ?? "rgba(196, 92, 38, 0.85)";
  const strokeWidth = opts.strokeWidth ?? 2;

  return (e: PlotterEvent) => {
    if (seriesFilter && e.setName !== seriesFilter) {
      return;
    }
    const points = e.points;
    if (!points.length) {
      return;
    }

    const ctx = e.drawingContext;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();

    let started = false;
    const ys: number[] = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const y = p.yval;
      if (y == null || !isFinite(y) || p.canvasx == null || p.canvasy == null) {
        ys.length = 0;
        started = false;
        continue;
      }
      ys.push(y);
      if (ys.length > period) {
        ys.shift();
      }
      if (ys.length < period) {
        continue;
      }
      let sum = 0;
      for (const v of ys) {
        sum += v;
      }
      const avg = sum / ys.length;
      if (!isChartHost(e.zpgraph)) {
        continue;
      }
      const g = e.zpgraph;
      const axisIdx = g.getPropertiesForSeries(e.setName)?.axis ?? 0;
      if (!g.yAxisRange?.(axisIdx)) {
        continue;
      }
      const cy = g.toDomYCoord(avg, axisIdx);
      if (cy == null) {
        continue;
      }

      if (!started) {
        ctx.moveTo(p.canvasx, cy);
        started = true;
      } else {
        ctx.lineTo(p.canvasx, cy);
      }
    }

    if (started) {
      ctx.stroke();
    }
    ctx.restore();
  };
};

const movingAveragePlotter: MovingAveragePlotter = Object.assign(
  createMovingAveragePlotter({ period: 7 }),
  { period: 7 },
);

export default movingAveragePlotter;

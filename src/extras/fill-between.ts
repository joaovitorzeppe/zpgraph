/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import ZpgraphImport from "zpgraph";
import type { Plotter, PlotterEvent, Point } from "../types";

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  fillBetweenPlotter?: Plotter;
};

const Zpgraph: ZpgraphExtrasHost = ZpgraphImport;

export type FillBetweenOptions = {
  seriesA: string;
  seriesB: string;
  fillColor?: string;
};

const isPointArray = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  (v.length === 0 ||
    (typeof v[0] === "object" && v[0] !== null && "canvasx" in v[0]));

const readAllSeriesPoints = (e: PlotterEvent): Point[][] | null => {
  const raw = Reflect.get(e, "allSeriesPoints");
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: Point[][] = [];
  for (const entry of raw) {
    if (!isPointArray(entry)) {
      return null;
    }
    out.push(entry);
  }
  return out;
};

/**
 * Fill the band between two named series. Draw once (on seriesIndex 0).
 * Put before linePlotter in the plotter array.
 */
export const createFillBetweenPlotter = (opts: FillBetweenOptions): Plotter => {
  const fillColor = opts.fillColor ?? "rgba(27, 107, 147, 0.2)";

  return (e: PlotterEvent) => {
    if (e.seriesIndex !== 0) {
      return;
    }
    const sets = readAllSeriesPoints(e);
    if (!sets || !e.setNames) {
      return;
    }
    const idxA = e.setNames.indexOf(opts.seriesA);
    const idxB = e.setNames.indexOf(opts.seriesB);
    if (idxA < 0 || idxB < 0) {
      return;
    }
    const a = sets[idxA];
    const b = sets[idxB];
    if (!a?.length || !b?.length) {
      return;
    }

    const ctx = e.drawingContext;
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < a.length; i++) {
      const p = a[i]!;
      if (p.canvasx == null || p.canvasy == null || p.yval == null) {
        continue;
      }
      if (!started) {
        ctx.moveTo(p.canvasx, p.canvasy);
        started = true;
      } else {
        ctx.lineTo(p.canvasx, p.canvasy);
      }
    }
    for (let i = b.length - 1; i >= 0; i--) {
      const p = b[i]!;
      if (p.canvasx == null || p.canvasy == null || p.yval == null) {
        continue;
      }
      ctx.lineTo(p.canvasx, p.canvasy);
    }
    if (started) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
};

const fillBetweenPlotter = createFillBetweenPlotter({
  seriesA: "A",
  seriesB: "B",
});
Zpgraph.fillBetweenPlotter = fillBetweenPlotter;

export default createFillBetweenPlotter;

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type {
  AxisAnnotation,
  ChartAnnotations,
  EventMarker,
  PointAnnotation,
  TextAnnotation,
} from "../types";

const toMs = (v: number | string | Date): number => {
  if (v instanceof Date) {
    return v.getTime();
  }
  if (typeof v === "number") {
    return v;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : Number(v);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isAxisAnnotation = (x: unknown): x is AxisAnnotation =>
  typeof x === "object" && x !== null;

const isPointAnnotation = (x: unknown): x is PointAnnotation =>
  typeof x === "object" && x !== null;

const isTextAnnotation = (x: unknown): x is TextAnnotation =>
  typeof x === "object" && x !== null && typeof Reflect.get(x, "text") === "string";

const isEventMarker = (x: unknown): x is EventMarker =>
  typeof x === "object" && x !== null && Reflect.get(x, "x") != null;

const filterArray = <T>(
  v: unknown,
  guard: (x: unknown) => x is T,
): T[] | undefined => {
  if (!Array.isArray(v)) {
    return undefined;
  }
  return v.every(guard) ? v : undefined;
};

const readChartAnnotations = (v: unknown): ChartAnnotations | undefined => {
  if (!isPlainObject(v)) {
    return undefined;
  }
  const out: ChartAnnotations = {};
  const xaxis = filterArray(Reflect.get(v, "xaxis"), isAxisAnnotation);
  if (xaxis) {
    out.xaxis = xaxis;
  }
  const yaxis = filterArray(Reflect.get(v, "yaxis"), isAxisAnnotation);
  if (yaxis) {
    out.yaxis = yaxis;
  }
  const points = filterArray(Reflect.get(v, "points"), isPointAnnotation);
  if (points) {
    out.points = points;
  }
  const texts = filterArray(Reflect.get(v, "texts"), isTextAnnotation);
  if (texts) {
    out.texts = texts;
  }
  return out;
};

const readEventMarkers = (v: unknown): EventMarker[] | undefined =>
  filterArray(v, isEventMarker);

class chart_annotations {
  toString() {
    return "Chart Annotations Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      willDrawChart: this.willDrawChart,
    };
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    const ann = readChartAnnotations(g.getOption("chartAnnotations"));
    if (ann) {
      const ctx = e.drawingContext;
      const area = g.plotter_.area;
      for (const a of ann.xaxis ?? []) {
        drawXAxis(g, ctx, area, a);
      }
      for (const a of ann.yaxis ?? []) {
        drawYAxis(g, ctx, area, a);
      }
      for (const p of ann.points ?? []) {
        drawPoint(g, ctx, p);
      }
      for (const t of ann.texts ?? []) {
        drawText(g, ctx, t);
      }
    }

    const markers = readEventMarkers(g.getOption("eventMarkers"));
    if (markers?.length) {
      const ctx = e.drawingContext;
      const area = g.plotter_.area;
      for (const m of markers) {
        const x = g.toDomXCoord(toMs(m.x));
        if (x == null) {
          continue;
        }
        ctx.save();
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.h);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) {
          ctx.fillStyle = "#333";
          ctx.font = "11px sans-serif";
          ctx.textBaseline = "top";
          ctx.fillText(m.label, x + 3, area.y + 4);
        }
        ctx.restore();
      }
    }
  }
}

const drawXAxis = (
  g: ZpgraphInstance,
  ctx: CanvasRenderingContext2D,
  area: { x: number; y: number; w: number; h: number },
  a: AxisAnnotation,
) => {
  if (a.x == null) {
    return;
  }
  const x1 = g.toDomXCoord(toMs(a.x));
  if (x1 == null) {
    return;
  }
  const x2 = a.x2 != null ? g.toDomXCoord(toMs(a.x2)) : null;
  ctx.save();
  if (x2 != null) {
    ctx.fillStyle = a.fillColor ?? "rgba(27,107,147,0.12)";
    ctx.globalAlpha = a.opacity ?? 1;
    ctx.fillRect(Math.min(x1, x2), area.y, Math.abs(x2 - x1), area.h);
  }
  ctx.strokeStyle = a.borderColor ?? "#1b6b93";
  ctx.lineWidth = a.strokeWidth ?? 1;
  ctx.beginPath();
  ctx.moveTo(x1, area.y);
  ctx.lineTo(x1, area.y + area.h);
  if (x2 != null) {
    ctx.moveTo(x2, area.y);
    ctx.lineTo(x2, area.y + area.h);
  }
  ctx.stroke();
  if (a.label) {
    ctx.fillStyle = a.labelColor ?? a.borderColor ?? "#1b6b93";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(a.label, x1 + 4, area.y + 4);
  }
  ctx.restore();
};

const drawYAxis = (
  g: ZpgraphInstance,
  ctx: CanvasRenderingContext2D,
  area: { x: number; y: number; w: number; h: number },
  a: AxisAnnotation,
) => {
  if (a.y == null) {
    return;
  }
  const axisIdx = a.axis === "y2" ? 1 : 0;
  const y1 = g.toDomYCoord(a.y, axisIdx);
  if (y1 == null) {
    return;
  }
  const y2 = a.y2 != null ? g.toDomYCoord(a.y2, axisIdx) : null;
  ctx.save();
  if (y2 != null) {
    ctx.fillStyle = a.fillColor ?? "rgba(196,92,38,0.12)";
    ctx.globalAlpha = a.opacity ?? 1;
    ctx.fillRect(area.x, Math.min(y1, y2), area.w, Math.abs(y2 - y1));
  }
  ctx.strokeStyle = a.borderColor ?? "#c45c26";
  ctx.lineWidth = a.strokeWidth ?? 1;
  ctx.beginPath();
  ctx.moveTo(area.x, y1);
  ctx.lineTo(area.x + area.w, y1);
  if (y2 != null) {
    ctx.moveTo(area.x, y2);
    ctx.lineTo(area.x + area.w, y2);
  }
  ctx.stroke();
  if (a.label) {
    ctx.fillStyle = a.labelColor ?? a.borderColor ?? "#c45c26";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(a.label, area.x + 4, y1 - 2);
  }
  ctx.restore();
};

const drawPoint = (
  g: ZpgraphInstance,
  ctx: CanvasRenderingContext2D,
  p: PointAnnotation,
) => {
  const x = g.toDomXCoord(toMs(p.x));
  const y = g.toDomYCoord(p.y);
  if (x == null || y == null) {
    return;
  }
  const r = p.markerSize ?? 4;
  ctx.save();
  ctx.fillStyle = p.markerColor ?? "#c45c26";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (p.label) {
    ctx.fillStyle = "#333";
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(p.label, x + r + 2, y - 2);
  }
  ctx.restore();
};

const drawText = (
  g: ZpgraphInstance,
  ctx: CanvasRenderingContext2D,
  t: TextAnnotation,
) => {
  const x = g.toDomXCoord(toMs(t.x));
  const y = g.toDomYCoord(t.y);
  if (x == null || y == null) {
    return;
  }
  ctx.save();
  ctx.fillStyle = t.color ?? "#333";
  ctx.font = "12px sans-serif";
  ctx.fillText(t.text, x, y);
  ctx.restore();
};

export default chart_annotations;

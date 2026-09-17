/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type Zpgraph from "./zpgraph";

export type ToPngOptions = {
  scale?: number;
  background?: string;
};

export type ToCsvOptions = {
  includeHeader?: boolean;
  /** Drop hidden series columns (default true). */
  visibleOnly?: boolean;
  /** Prefix UTF-8 BOM for Excel (default false; download path enables it). */
  utf8Bom?: boolean;
};

/**
 * Rasterize the plot canvas (hidden_) plus interaction overlay (canvas_).
 * Chart series are drawn on hidden_; canvas_ is cleared each frame for overlays.
 */
export const toPng = (g: Zpgraph, opts: ToPngOptions = {}): string => {
  const plot = g.hidden_ ?? g.canvas_;
  if (!plot) {
    return "";
  }

  const overlay = g.canvas_;
  const scale = opts.scale ?? 1;
  const w = plot.width;
  const h = plot.height;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext("2d");
  if (!ctx) {
    return "";
  }

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(plot, 0, 0, out.width, out.height);
  if (overlay && overlay !== plot) {
    ctx.drawImage(overlay, 0, 0, out.width, out.height);
  }
  return out.toDataURL("image/png");
};

/** Dump chart data as CSV (UTF-8). */
export const toCsv = (g: Zpgraph, opts: ToCsvOptions = {}): string => {
  const includeHeader = opts.includeHeader !== false;
  const visibleOnly = opts.visibleOnly !== false;
  const visibility = g.visibility() ?? [];
  const allLabels = g.getLabels() ?? [];

  const colIdx = allLabels
    .map((_, c) => c)
    .filter((c) => c === 0 || !visibleOnly || visibility[c - 1] !== false);

  const rows: string[] = [];
  if (includeHeader && colIdx.length) {
    rows.push(colIdx.map((c) => escapeCsv(allLabels[c] ?? "")).join(","));
  }

  const n = g.numRows();
  for (let r = 0; r < n; r++) {
    const cells: string[] = [];
    for (const c of colIdx) {
      cells.push(formatCsvCell(g.getValue(r, c)));
    }
    rows.push(cells.join(","));
  }

  const body = rows.join("\n");
  return opts.utf8Bom ? "\uFEFF" + body : body;
};

const formatCsvCell = (v: unknown): string => {
  if (v == null) {
    return "";
  }
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? escapeCsv(v.toISOString()) : "";
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "";
  }
  if (Array.isArray(v)) {
    const nums = v.filter((x) => typeof x === "number" && Number.isFinite(x));
    return escapeCsv(nums.join(";"));
  }
  const s = String(v);
  return s === "NaN" ? "" : escapeCsv(s);
};

const escapeCsv = (s: string): string => {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

/** Trigger a browser download for a data URL or text blob. */
export const downloadText = (filename: string, text: string, mime: string) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadDataUrl = (filename: string, dataUrl: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

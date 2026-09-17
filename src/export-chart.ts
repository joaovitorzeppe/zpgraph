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
};

/** Rasterize the main chart canvas to a PNG data URL. */
export const toPng = (g: Zpgraph, opts: ToPngOptions = {}): string => {
  const src = g.canvas_;
  if (!src) return "";

  const scale = opts.scale ?? 1;
  if (scale === 1 && !opts.background) {
    return src.toDataURL("image/png");
  }

  const w = src.width;
  const h = src.height;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
};

/** Dump raw chart data as CSV. */
export const toCsv = (g: Zpgraph, opts: ToCsvOptions = {}): string => {
  const includeHeader = opts.includeHeader !== false;
  const labels = g.getLabels() ?? [];
  const rows: string[] = [];
  if (includeHeader && labels.length) {
    rows.push(labels.map(escapeCsv).join(","));
  }
  const n = g.numRows();
  const cols = g.numColumns();
  for (let r = 0; r < n; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const v = g.getValue(r, c);
      if (v == null) cells.push("");
      else if (v instanceof Date) cells.push(escapeCsv(v.toISOString()));
      else if (typeof v === "number") cells.push(String(v));
      else if (Array.isArray(v)) cells.push(escapeCsv(v.join(";")));
      else cells.push(escapeCsv(String(v)));
    }
    rows.push(cells.join(","));
  }
  return rows.join("\n");
};

const escapeCsv = (s: string): string => {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
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

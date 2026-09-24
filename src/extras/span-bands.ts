/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import {
  applyLabelStyle,
  getChartClassNames,
} from "../class-names";
import { pooledLabel } from "../label-pool";
import type {
  ChartDrawPluginEvent,
  ZpgraphInstance,
} from "../internal-types";
import type { LabelStyle } from "../types";
import type ZpgraphClass from "../zpgraph";


export type SpanBand = {
  x0: number | Date;
  x1: number | Date;
  color: string;
  label?: string;
  /** Styling for the chip label. */
  labelStyle?: LabelStyle;
};

export type SpanBandsOptions = {
  bands: SpanBand[];
  /** Band strip height in px from plot bottom. Default 8. */
  height?: number;
  /** Vertical offset from plot bottom. Default 4. */
  offsetY?: number;
  /** Default labelStyle for every band label (per-band wins). */
  labelStyle?: LabelStyle;
  /** @deprecated Prefer labelStyle.style.color */
  labelColor?: string;
  /** @deprecated Prefer labelStyle.style.font */
  labelFont?: string;
};

const toMs = (v: number | Date): number =>
  v instanceof Date ? v.getTime() : v;

/**
 * Draw a rounded label chip on the canvas (TemperatureChart-style).
 * Prefer DOM labels via SpanBands for className / React; keep this for
 * one-off underlayCallback drawing.
 */
export const writeTextInGraph = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts?: {
    width?: number;
    height?: number;
    background?: string;
    color?: string;
    font?: string;
  },
): void => {
  const width = opts?.width ?? Math.max(80, text.length * 7 + 16);
  const height = opts?.height ?? 20;
  const radius = 5;
  const left = x - width / 2;
  const top = y - height / 2;

  ctx.save();
  ctx.fillStyle = opts?.background ?? "rgba(13, 27, 42, 0.75)";
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + width - radius, top);
  ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
  ctx.lineTo(left + width, top + height - radius);
  ctx.quadraticCurveTo(
    left + width,
    top + height,
    left + width - radius,
    top + height,
  );
  ctx.lineTo(left + radius, top + height);
  ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = opts?.color ?? "#fff";
  ctx.font = opts?.font ?? "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
};

/**
 * X-axis span bands (status / mode strips) drawn at the bottom of the plot.
 * Labels are DOM chips (className / style / CSS / React-friendly).
 */
class SpanBands {
  bands_: SpanBand[];
  height_: number;
  offsetY_: number;
  labelStyle_: LabelStyle | undefined;
  labelEls_: HTMLElement[] = [];
  g_: ZpgraphInstance | null = null;

  constructor(opt_options?: SpanBandsOptions) {
    const opts = opt_options || { bands: [] };
    this.bands_ = opts.bands || [];
    this.height_ = opts.height ?? 8;
    this.offsetY_ = opts.offsetY ?? 4;
    this.labelStyle_ = opts.labelStyle;
    if (!this.labelStyle_ && (opts.labelColor || opts.labelFont)) {
      this.labelStyle_ = {
        style: {
          ...(opts.labelColor ? { color: opts.labelColor } : {}),
          ...(opts.labelFont ? { font: opts.labelFont } : {}),
        },
      };
    }
  }

  toString() {
    return "SpanBands Plugin";
  }

  setBands(bands: SpanBand[]) {
    this.bands_ = bands;
  }

  activate(g: ZpgraphClass) {
    this.g_ = g;
    return {
      willDrawChart: this.willDrawChart,
      clearChart: this.clearChart,
    };
  }

  clearChart = () => {
    for (const el of this.labelEls_) {
      el.remove();
    }
    this.labelEls_ = [];
  };

  willDrawChart = (e: ChartDrawPluginEvent) => {
    const g = e.zpgraph;
    const ctx = e.drawingContext;
    const area = g.layout_.getPlotArea();
    const y = area.y + area.h - this.offsetY_ - this.height_;
    const chartClasses = getChartClassNames(g);
    let labelIdx = 0;

    for (const band of this.bands_) {
      const x0 = g.toDomXCoord(toMs(band.x0));
      const x1 = g.toDomXCoord(toMs(band.x1));
      if (x0 == null || x1 == null) {
        continue;
      }
      const left = Math.max(area.x, Math.min(x0, x1));
      const right = Math.min(area.x + area.w, Math.max(x0, x1));
      const w = right - left;
      if (w <= 0) {
        continue;
      }
      ctx.save();
      ctx.fillStyle = band.color;
      ctx.fillRect(left, y, w, this.height_);
      ctx.restore();

      if (band.label && w > 40) {
        const el = pooledLabel(
          this.labelEls_,
          labelIdx,
          g.graphDiv,
          "span-band",
        );
        const merged: LabelStyle = {
          ...this.labelStyle_,
          ...band.labelStyle,
          style: {
            ...this.labelStyle_?.style,
            ...band.labelStyle?.style,
          },
        };
        applyLabelStyle(
          el,
          "zpgraph-span-band-label",
          merged,
          chartClasses.spanBandLabel,
        );
        el.dataset.zpIndex = String(labelIdx);
        if (!el.querySelector(".zpgraph-react-host")) {
          el.textContent = band.label;
        }
        if (!merged.style?.background && !merged.style?.["background-color"]) {
          el.style.background = band.color;
        }
        el.style.position = "absolute";
        el.style.left = `${left + w / 2}px`;
        el.style.top = `${y - 14}px`;
        el.style.transform = "translate(-50%, -100%)";
        el.style.zIndex = "11";
        el.style.pointerEvents = "none";
        labelIdx++;
      }
    }

    while (this.labelEls_.length > labelIdx) {
      this.labelEls_.pop()?.remove();
    }
  };

  destroy() {
    this.clearChart();
    this.g_ = null;
  }
}


export default SpanBands;

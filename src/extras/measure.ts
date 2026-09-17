/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import ZpgraphImport from "zpgraph";
import {
  applyLabelStyle,
  getChartClassNames,
} from "../class-names";
import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { LabelStyle } from "../types";
import type ZpgraphClass from "../zpgraph";
import { div, setStyle } from "./dom-helpers";

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  Plugins: Record<string, unknown> & { Measure?: typeof Measure };
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;
Zpgraph.Plugins = Zpgraph.Plugins || {};

interface ChartClickEvent {
  zpgraph: ZpgraphInstance;
  canvasx: number;
  canvasy: number;
}

export type MeasurePoint = {
  xval: number;
  yval: number;
  canvasx: number;
  canvasy: number;
};

export type MeasureResult = {
  a: MeasurePoint;
  b: MeasurePoint;
  deltaX: number;
  deltaY: number;
  deltaYPercent: number | null;
};

export type MeasureOptions = {
  strokeStyle?: string;
  onMeasure?: (result: MeasureResult) => void;
  /** Styling for the Δ overlay. */
  labelStyle?: LabelStyle;
};

/**
 * Two-click measure ruler: first click sets A, second sets B and shows
 * Δx / Δy / Δ%. Third click (or clear()) resets.
 */
class Measure {
  strokeStyle_: string;
  onMeasure_: ((result: MeasureResult) => void) | null;
  labelStyle_: LabelStyle | undefined;
  a_: MeasurePoint | null = null;
  b_: MeasurePoint | null = null;
  g_: ZpgraphInstance | null = null;
  label_: HTMLElement | null = null;

  constructor(opt_options?: MeasureOptions) {
    const opts = opt_options || {};
    this.strokeStyle_ = opts.strokeStyle || "rgba(196, 92, 38, 0.9)";
    this.onMeasure_ = opts.onMeasure || null;
    this.labelStyle_ = opts.labelStyle;
  }

  toString() {
    return "Measure Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g as unknown as ZpgraphInstance;
    this.label_ = div("zpgraph-measure-label");
    this.label_.dataset.zpLabel = "measure";
    applyLabelStyle(
      this.label_,
      "zpgraph-measure-label",
      this.labelStyle_,
      getChartClassNames(this.g_).measureLabel,
    );
    setStyle(this.label_, {
      position: "absolute",
      "pointer-events": "none",
      "z-index": "12",
      display: "none",
      "white-space": "nowrap",
    });
    g.graphDiv.appendChild(this.label_);

    return {
      click: this.click,
      willDrawChart: this.willDrawChart,
    };
  }

  clear() {
    this.a_ = null;
    this.b_ = null;
    if (this.label_) {
      this.label_.style.display = "none";
    }
    this.g_?.drawGraph_?.();
  }

  click(e: ChartClickEvent) {
    const g = e.zpgraph;
    const xval = g.toDataXCoord(e.canvasx);
    const yval = g.toDataYCoord(e.canvasy);
    if (xval == null || yval == null) {
      return;
    }

    const point: MeasurePoint = {
      xval,
      yval,
      canvasx: e.canvasx,
      canvasy: e.canvasy,
    };

    if (!this.a_ || this.b_) {
      this.a_ = point;
      this.b_ = null;
      if (this.label_) {
        this.label_.style.display = "none";
      }
      g.drawGraph_?.();
      return;
    }

    this.b_ = point;
    const result = this.buildResult_();
    if (result && this.onMeasure_) {
      this.onMeasure_(result);
    }
    this.updateLabel_(result);
    g.drawGraph_?.();
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    const a = this.a_;
    if (!a) {
      return;
    }
    const g = e.zpgraph;
    const ctx = e.drawingContext;
    const ax = g.toDomXCoord(a.xval);
    const ay = g.toDomYCoord(a.yval);
    if (ax == null || ay == null) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = this.strokeStyle_;
    ctx.fillStyle = this.strokeStyle_;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);

    ctx.beginPath();
    ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fill();

    const b = this.b_;
    if (b) {
      const bx = g.toDomXCoord(b.xval);
      const by = g.toDomYCoord(b.yval);
      if (bx != null && by != null) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        // Axis projections
        ctx.setLineDash([2, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  buildResult_(): MeasureResult | null {
    const a = this.a_;
    const b = this.b_;
    if (!a || !b) {
      return null;
    }
    const deltaX = b.xval - a.xval;
    const deltaY = b.yval - a.yval;
    const deltaYPercent =
      a.yval !== 0 ? (deltaY / Math.abs(a.yval)) * 100 : null;
    return { a, b, deltaX, deltaY, deltaYPercent };
  }

  updateLabel_(result: MeasureResult | null) {
    const label = this.label_;
    const g = this.g_;
    if (!label || !g || !result) {
      return;
    }
    const midX =
      ((g.toDomXCoord(result.a.xval) ?? 0) +
        (g.toDomXCoord(result.b.xval) ?? 0)) /
      2;
    const midY =
      ((g.toDomYCoord(result.a.yval) ?? 0) +
        (g.toDomYCoord(result.b.yval) ?? 0)) /
      2;
    const dx =
      Math.abs(result.deltaX) >= 86400000
        ? `${(result.deltaX / 86400000).toFixed(2)} d`
        : `${Math.round(result.deltaX)} ms`;
    const dy = result.deltaY.toFixed(2);
    const pct =
      result.deltaYPercent != null
        ? ` (${result.deltaYPercent.toFixed(1)}%)`
        : "";
    if (!label.querySelector(".zpgraph-react-host")) {
      label.textContent = `Δx ${dx}  ·  Δy ${dy}${pct}`;
    }
    label.dataset.zpDx = dx;
    label.dataset.zpDy = dy;
    setStyle(label, {
      display: "block",
      left: `${midX + 8}px`,
      top: `${midY - 28}px`,
    });
  }

  destroy() {
    this.label_?.remove();
    this.label_ = null;
    this.g_ = null;
    this.a_ = null;
    this.b_ = null;
  }
}

Zpgraph.Plugins.Measure = Measure;

export default Measure;

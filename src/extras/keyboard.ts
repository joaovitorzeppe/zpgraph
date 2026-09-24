/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ZpgraphInstance } from "../internal-types";
import type ZpgraphClass from "../zpgraph";
import { panBy, zoomBy } from "./zoom-limits";


export type KeyboardOptions = {
  /** Plain arrows pan without Shift. Default true. */
  arrowsPan?: boolean;
  /** Zoom factor for +/- keys. Default 0.8 (in) / 1/0.8 (out). */
  zoomFactor?: number;
  /** Pan step as fraction of current span. Default 0.1. */
  panFraction?: number;
};

/**
 * Extra keyboard shortcuts on top of core Shift+arrows a11y:
 * - Arrow keys: pan (when arrowsPan). The event is claimed only when the view changes.
 * - `+` / `=`: zoom in; `-`: zoom out
 * - Escape: reset zoom
 *
 * Chart must be focused (`tabIndex` is set by core). Pan only moves when the
 * window is not already clamped to full data (zoom in first).
 *
 * Uses zoom-limits helpers when that plugin is attached.
 */
class Keyboard {
  opts_: Required<
    Pick<KeyboardOptions, "arrowsPan" | "zoomFactor" | "panFraction">
  >;
  g_: ZpgraphInstance | null = null;
  handler_: ((e: KeyboardEvent) => void) | null = null;

  constructor(opt_options?: KeyboardOptions) {
    const opts = opt_options || {};
    this.opts_ = {
      arrowsPan: opts.arrowsPan !== false,
      zoomFactor: opts.zoomFactor ?? 0.8,
      panFraction: opts.panFraction ?? 0.1,
    };
  }

  toString() {
    return "Keyboard Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g;
    this.handler_ = (e: KeyboardEvent) => this.onKey_(e);
    // Capture so a real pan or zoom runs before core keyDown. No-op keys fall through.
    g.graphDiv.addEventListener("keydown", this.handler_, true);
    return {};
  }

  onKey_(e: KeyboardEvent) {
    const g = this.g_;
    if (!g) {
      return;
    }
    // Let core Shift+arrows handle their path.
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }

    const key = e.key;
    let changed = false;

    if (this.opts_.arrowsPan && (key === "ArrowLeft" || key === "ArrowRight")) {
      const fraction =
        key === "ArrowLeft" ? -this.opts_.panFraction : this.opts_.panFraction;
      changed = panBy(g, fraction);
    } else if (key === "+" || key === "=") {
      changed = zoomBy(g, this.opts_.zoomFactor);
    } else if (key === "-" || key === "_") {
      changed = zoomBy(g, 1 / this.opts_.zoomFactor);
    } else if (key === "Escape" && g.isZoomed()) {
      const before = g.xAxisRange();
      g.resetZoom();
      const after = g.xAxisRange();
      changed =
        !g.isZoomed() || before[0] !== after[0] || before[1] !== after[1];
    }

    if (changed) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  destroy() {
    if (this.g_ && this.handler_) {
      this.g_.graphDiv.removeEventListener("keydown", this.handler_, true);
    }
    this.handler_ = null;
    this.g_ = null;
  }
}


export default Keyboard;

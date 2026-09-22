/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import ZpgraphImport from "zpgraph";
import type { ZpgraphInstance } from "../internal-types";
import type ZpgraphClass from "../zpgraph";
import { panBy, zoomBy } from "./zoom-limits";

ZpgraphImport.Plugins = ZpgraphImport.Plugins || {};

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
 * - Arrow keys: pan (when arrowsPan; claims capture so core selection skips)
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
    // Capture so we win over core keyDown (point selection on plain arrows).
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
    let claim = false;

    if (this.opts_.arrowsPan && (key === "ArrowLeft" || key === "ArrowRight")) {
      if (key === "ArrowLeft") {
        panBy(g, -this.opts_.panFraction);
      } else {
        panBy(g, this.opts_.panFraction);
      }
      // Always claim: avoid core selection walk when pan is a no-op (full zoom).
      claim = true;
    } else if (key === "+" || key === "=") {
      zoomBy(g, this.opts_.zoomFactor);
      claim = true;
    } else if (key === "-" || key === "_") {
      zoomBy(g, 1 / this.opts_.zoomFactor);
      claim = true;
    } else if (key === "Escape") {
      g.resetZoom();
      claim = true;
    }

    if (claim) {
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

Object.assign(ZpgraphImport.Plugins, { Keyboard });

export default Keyboard;

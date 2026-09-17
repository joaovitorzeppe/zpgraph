/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZpgraphImport from "zpgraph";
import type { SelectPluginEvent } from "../internal-types";
import type ZpgraphClass from "../zpgraph";

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  Plugins: Record<string, unknown> & { Crosshair?: typeof Crosshair };
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;
Zpgraph.Plugins = Zpgraph.Plugins || {};

/**
 * Draws a crosshair through the selected point.
 */
class Crosshair {
  canvas_: HTMLCanvasElement | null;
  direction_: string | null;
  strokeStyle_: string;

  constructor(opt_options?: { direction?: string; strokeStyle?: string }) {
    this.canvas_ = document.createElement("canvas");
    opt_options = opt_options || {};
    this.direction_ = opt_options.direction || null;
    this.strokeStyle_ = opt_options.strokeStyle || "rgba(0, 0, 0, 0.3)";
  }

  updateCanvasSize(width: number, height: number) {
    const canvas = this.canvas_!;
    if (width === canvas.width && height === canvas.height) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
  }

  toString() {
    return "Crosshair Plugin";
  }

  /**
   * @param g Graph instance.
   * @return Mapping of event names to callbacks.
   */
  activate(g: ZpgraphClass) {
    this.updateCanvasSize(g.width_, g.height_);
    g.graphDiv.appendChild(this.canvas_!);

    return {
      select: this.select,
      deselect: this.deselect,
    };
  }

  select(e: SelectPluginEvent) {
    if (this.direction_ === null) {
      return;
    }

    const width = e.zpgraph.width_;
    const height = e.zpgraph.height_;
    this.updateCanvasSize(width, height);

    const ctx = this.canvas_!.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = this.strokeStyle_;
    ctx.beginPath();

    if (this.direction_ === "both" || this.direction_ === "vertical") {
      if (e.zpgraph.selPoints_.length !== 0) {
        const p = e.zpgraph.selPoints_[0]!;
        if (p.x != null && p.x >= 0 && p.x <= 1) {
          let canvasx = Math.floor(p.canvasx!) + 0.5; // crisper rendering
          if (canvasx > width) {
            canvasx = width - 0.5;
          }

          ctx.moveTo(canvasx, 0);
          ctx.lineTo(canvasx, height);
        }
      }
    }

    if (this.direction_ === "both" || this.direction_ === "horizontal") {
      for (let i = 0; i < e.zpgraph.selPoints_.length; i++) {
        const p = e.zpgraph.selPoints_[i]!;
        if (p.y != null && p.y >= 0 && p.y <= 1) {
          let canvasy = Math.floor(p.canvasy!) + 0.5; // crisper rendering
          if (canvasy > height) {
            canvasy = height - 0.5;
          }

          ctx.moveTo(0, canvasy);
          ctx.lineTo(width, canvasy);
        }
      }
    }

    ctx.stroke();
    ctx.closePath();
  }

  deselect(_e: SelectPluginEvent) {
    const canvas = this.canvas_!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }

  destroy() {
    this.canvas_ = null;
  }
}

Zpgraph.Plugins.Crosshair = Crosshair;

export default Crosshair;

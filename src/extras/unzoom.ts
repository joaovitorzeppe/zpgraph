/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import type { ChartDrawPluginEvent } from "../internal-types";
import type ZpgraphClass from "../zpgraph";


/**
 * @fileoverview Plug-in for providing unzoom-on-hover.
 */
class Unzoom {
  button_: HTMLButtonElement | null = null;

  // True when the mouse is over the canvas. Must be tracked
  // because the unzoom button state can change even when the
  // mouse-over state hasn't.
  over_ = false;

  toString() {
    return "Unzoom Plugin";
  }

  activate(_g: ZpgraphClass) {
    return {
      willDrawChart: this.willDrawChart,
    };
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;

    if (this.button_ === null) {
      const created = document.createElement("button");
      this.button_ = created;
      created.textContent = "Reset Zoom";
      created.style.display = "none";
      created.style.position = "absolute";
      created.style.zIndex = "11";
      const parent = g.graphDiv;
      parent.prepend(created);

      created.addEventListener("click", () => {
        g.resetZoom();
      });

      g.addAndTrackEvent(parent, "mouseover", () => {
        if (g.isZoomed()) {
          this.show(true);
        }
        this.over_ = true;
      });

      g.addAndTrackEvent(parent, "mouseout", () => {
        this.show(false);
        this.over_ = false;
      });
    }

    const button = this.button_;
    if (button === null) {
      return;
    }
    const area = g.plotter_.area;
    button.style.top = area.y + 4 + "px";
    button.style.left = area.x + 4 + "px";
    this.show(g.isZoomed() && this.over_);
  }

  show(enabled: boolean) {
    this.button_!.style.display = enabled ? "" : "none";
  }

  destroy() {
    const button = this.button_;
    button?.remove();
  }
}


export default Unzoom;

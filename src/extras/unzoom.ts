/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZpgraphImport from "zpgraph";
import type { ChartDrawPluginEvent } from "../internal-types";
import type ZpgraphClass from "../zpgraph";

ZpgraphImport.Plugins = ZpgraphImport.Plugins || {};

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

    if (this.button_ !== null) {
      // short-circuit: show the button only when we're moused over, and zoomed in.
      const showButton = g.isZoomed() && this.over_;
      this.show(showButton);
      return;
    }

    const button = document.createElement("button");
    this.button_ = button;
    button.textContent = "Reset Zoom";
    button.style.display = "none";
    button.style.position = "absolute";
    const area = g.plotter_.area;
    button.style.top = area.y + 4 + "px";
    button.style.left = area.x + 4 + "px";
    button.style.zIndex = "11";
    const parent = g.graphDiv;
    parent.prepend(button);

    button.addEventListener("click", () => {
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

  show(enabled: boolean) {
    this.button_!.style.display = enabled ? "" : "none";
  }

  destroy() {
    const button = this.button_;
    button?.remove();
  }
}

Object.assign(ZpgraphImport.Plugins, { Unzoom });

export default Unzoom;

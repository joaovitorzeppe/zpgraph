/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { ToolbarOptions, ToolbarTool } from "../types";
import { getChartClassNames, withClassNames } from "../class-names";
import {
  downloadDataUrl,
  downloadText,
  toCsv,
  toPng,
} from "../export-chart";
import ZpgraphInteraction from "../interaction-model";
import type Zpgraph from "../zpgraph";

const DEFAULT_TOOLS: ToolbarTool[] = [
  "zoomin",
  "zoomout",
  "pan",
  "reset",
  "downloadPng",
  "downloadCsv",
];

const LABELS: Record<ToolbarTool, string> = {
  zoomin: "Zoom in",
  zoomout: "Zoom out",
  pan: "Pan",
  reset: "Reset",
  downloadPng: "PNG",
  downloadCsv: "CSV",
  copyCsv: "Copy CSV",
};

class toolbar {
  el_: HTMLElement | null = null;
  panMode_ = false;

  toString() {
    return "Toolbar Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      didDrawChart: this.didDrawChart,
      clearChart: this.clearChart,
    };
  }

  clearChart(_e: ChartDrawPluginEvent) {
    this.detach_();
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph as unknown as Zpgraph;
    const opt = g.getOption("toolbar") as boolean | ToolbarOptions | undefined;
    if (!opt) {
      this.detach_();
      return;
    }

    const conf: ToolbarOptions = opt === true ? {} : opt;
    const tools = conf.tools?.length ? conf.tools : DEFAULT_TOOLS;
    const position = conf.position ?? "top-right";

    if (!this.el_) {
      this.el_ = document.createElement("div");
      this.el_.setAttribute("role", "toolbar");
      g.graphDiv.appendChild(this.el_);
    }

    this.el_.className = withClassNames(
      `zpgraph-toolbar zpgraph-toolbar-${position}`,
      getChartClassNames(g).toolbar,
    );
    this.el_.replaceChildren();

    for (const tool of tools) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "zpgraph-toolbar-btn";
      btn.textContent = LABELS[tool] ?? tool;
      btn.title = LABELS[tool] ?? tool;
      if (tool === "pan" && this.panMode_) {
        btn.classList.add("is-active");
      }
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.runTool_(g, tool);
      });
      this.el_.appendChild(btn);
    }
  }

  runTool_(g: Zpgraph, tool: ToolbarTool) {
    switch (tool) {
      case "zoomin":
        zoomBy(g, 0.7);
        break;
      case "zoomout":
        zoomBy(g, 1 / 0.7);
        break;
      case "pan":
        this.panMode_ = !this.panMode_;
        g.updateOptions({
          interactionModel: this.panMode_
            ? ZpgraphInteraction.dragIsPanInteractionModel
            : ZpgraphInteraction.defaultModel,
        });
        break;
      case "reset":
        this.panMode_ = false;
        g.updateOptions({
          interactionModel: ZpgraphInteraction.defaultModel,
        });
        g.resetZoom();
        break;
      case "downloadPng":
        downloadDataUrl("zpgraph.png", toPng(g, { background: "#fff" }));
        break;
      case "downloadCsv":
        downloadText("zpgraph.csv", toCsv(g), "text/csv;charset=utf-8");
        break;
      case "copyCsv":
        void navigator.clipboard?.writeText(toCsv(g));
        break;
    }
  }

  detach_() {
    if (this.el_?.parentNode) this.el_.parentNode.removeChild(this.el_);
    this.el_ = null;
  }

  destroy() {
    this.detach_();
  }
}

const zoomBy = (g: Zpgraph, factor: number) => {
  const [x0, x1] = g.xAxisRange();
  const mid = (x0 + x1) / 2;
  const half = ((x1 - x0) / 2) * factor;
  g.updateOptions({ dateWindow: [mid - half, mid + half] });
};

export default toolbar;

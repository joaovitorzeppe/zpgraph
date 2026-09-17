"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

import type {
  ChartDrawPluginEvent,
  LayoutPluginEvent,
  PlotArea,ZpgraphInstance
} from "../internal-types";
import { getChartClassNames, withClassNames } from "../class-names";

class chart_labels {
  title_div_: HTMLElement | null = null;
  xlabel_div_: HTMLElement | null = null;
  ylabel_div_: HTMLElement | null = null;
  y2label_div_: HTMLElement | null = null;

  toString() {
    return "ChartLabels Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      layout: this.layout,
      // clearChart: this.clearChart,
      didDrawChart: this.didDrawChart,
    };
  }

  detachLabels_() {
    const els = [
      this.title_div_,
      this.xlabel_div_,
      this.ylabel_div_,
      this.y2label_div_,
    ];
    for (const el of els) {
      el?.remove();
    }

    this.title_div_ = null;
    this.xlabel_div_ = null;
    this.ylabel_div_ = null;
    this.y2label_div_ = null;
  }

  layout(e: LayoutPluginEvent) {
    this.detachLabels_();

    const g = e.zpgraph;
    const div = e.chart_div;
    if (g.getOption("title")) {
      // reserveSpace* returns a PlotArea; createDivInRect wraps it as absolute DOM.
      const title_rect = e.reserveSpaceTop(g.getNumericOption("titleHeight"));
      this.title_div_ = createDivInRect(title_rect);
      this.title_div_.style.fontSize =
        g.getNumericOption("titleHeight") - 8 + "px";

      const class_div = document.createElement("div");
      class_div.className = withClassNames(
        "zpgraph-label zpgraph-title",
        getChartClassNames(g).title,
      );
      class_div.textContent = g.getStringOption("title");
      this.title_div_.appendChild(class_div);
      div.appendChild(this.title_div_);
    }

    if (g.getOption("xlabel")) {
      const x_rect = e.reserveSpaceBottom(g.getNumericOption("xLabelHeight"));
      this.xlabel_div_ = createDivInRect(x_rect);
      this.xlabel_div_.style.fontSize =
        g.getNumericOption("xLabelHeight") - 2 + "px";

      const class_div = document.createElement("div");
      class_div.className = withClassNames(
        "zpgraph-label zpgraph-xlabel",
        getChartClassNames(g).xlabel,
      );
      class_div.textContent = g.getStringOption("xlabel");
      this.xlabel_div_.appendChild(class_div);
      div.appendChild(this.xlabel_div_);
    }

    if (g.getOption("ylabel")) {
      // It would make sense to shift the chart here to make room for the y-axis
      // label, but the default yAxisLabelWidth is large enough that this results
      // in overly-padded charts. The y-axis label should fit fine. If it
      // doesn't, the yAxisLabelWidth option can be increased.
      const y_rect = e.reserveSpaceLeft(0);

      this.ylabel_div_ = createRotatedDiv(
        g,
        y_rect,
        1, // primary (left) y-axis
        withClassNames(
          "zpgraph-label zpgraph-ylabel",
          getChartClassNames(g).ylabel,
        ),
        g.getStringOption("ylabel"),
      );
      div.appendChild(this.ylabel_div_);
    }

    if (g.getOption("y2label") && g.numAxes() === 2) {
      // same logic applies here as for ylabel.
      const y2_rect = e.reserveSpaceRight(0);
      this.y2label_div_ = createRotatedDiv(
        g,
        y2_rect,
        2, // secondary (right) y-axis
        withClassNames(
          "zpgraph-label zpgraph-y2label",
          getChartClassNames(g).y2label,
        ),
        g.getStringOption("y2label"),
      );
      div.appendChild(this.y2label_div_);
    }
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    if (this.title_div_) {
      this.title_div_.children[0]!.textContent = g.getStringOption("title");
    }
    if (this.xlabel_div_) {
      this.xlabel_div_.children[0]!.textContent = g.getStringOption("xlabel");
    }
    if (this.ylabel_div_) {
      this.ylabel_div_.children[0]!.children[0]!.textContent =
        g.getStringOption("ylabel");
    }
    if (this.y2label_div_) {
      this.y2label_div_.children[0]!.children[0]!.textContent =
        g.getStringOption("y2label");
    }
  }

  clearChart() {}

  destroy() {
    this.detachLabels_();
  }
}

// Local helpers — only chart-labels needs these; no shared plugin-utils yet.
const createDivInRect = (r: PlotArea) => {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = r.x + "px";
  div.style.top = r.y + "px";
  div.style.width = r.w + "px";
  div.style.height = r.h + "px";
  return div;
};

const createRotatedDiv = (
  g: ZpgraphInstance,
  box: PlotArea,
  axis: 1 | 2,
  classes: string,
  text: string,
) => {
  const div = document.createElement("div");
  div.style.position = "absolute";
  if (axis === 1) {
    // NOTE: this is cheating. Should be positioned relative to the box.
    div.style.left = "0px";
  } else {
    div.style.left = box.x + "px";
  }
  div.style.top = box.y + "px";
  div.style.width = box.w + "px";
  div.style.height = box.h + "px";
  div.style.fontSize = g.getNumericOption("yLabelWidth") - 2 + "px";

  const inner_div = document.createElement("div");
  inner_div.style.position = "absolute";
  inner_div.style.width = box.h + "px";
  inner_div.style.height = box.w + "px";
  inner_div.style.top = box.h / 2 - box.w / 2 + "px";
  inner_div.style.left = box.w / 2 - box.h / 2 + "px";
  inner_div.className =
    "zpgraph-label-rotate-" + (axis === 1 ? "right" : "left");

  const class_div = document.createElement("div");
  class_div.className = classes;
  // textContent, not innerHTML: chart labels are routinely built from
  // application data (a device name, a customer), so HTML here is an
  // injection sink.
  class_div.textContent = text;

  inner_div.appendChild(class_div);
  div.appendChild(inner_div);
  return div;
};

export default chart_labels;

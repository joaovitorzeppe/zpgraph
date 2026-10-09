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
  PlotArea,
  ZpgraphInstance,
} from "../internal-types";
import { getChartClassNames, withClassNames } from "../class-names";
import {
  buildAxisColumns,
  sideGutterWidth,
  type AxisColumn,
} from "../axis-chrome";
import type { AxisSide } from "../types";

class chart_labels {
  title_div_: HTMLElement | null = null;
  xlabel_div_: HTMLElement | null = null;
  /** Axis titles keyed by axis name (`y`, `y2`, `y3`, …). */
  yAxisLabels_: Record<string, HTMLElement> = {};

  toString() {
    return "ChartLabels Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      layout: this.layout,
      didDrawChart: this.didDrawChart,
    };
  }

  detachLabels_() {
    const els = [
      this.title_div_,
      this.xlabel_div_,
      ...Object.values(this.yAxisLabels_),
    ];
    for (const el of els) {
      el?.remove();
    }

    this.title_div_ = null;
    this.xlabel_div_ = null;
    this.yAxisLabels_ = {};
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

    // Plugin cascade is reverse PLUGINS order, so ChartLabels runs before Axes.
    // Reserve full Y gutters here; Axes only draws ticks into that space.
    const leftW = sideGutterWidth(g, "left");
    const rightW = sideGutterWidth(g, "right");
    const leftStrip = leftW > 0 ? e.reserveSpaceLeft(leftW) : null;
    const rightStrip = rightW > 0 ? e.reserveSpaceRight(rightW) : null;

    if (leftStrip) {
      placeSideTitles(
        g,
        div,
        leftStrip,
        buildAxisColumns(g, "left"),
        this.yAxisLabels_,
      );
    }
    if (rightStrip) {
      placeSideTitles(
        g,
        div,
        rightStrip,
        buildAxisColumns(g, "right"),
        this.yAxisLabels_,
      );
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
    for (const col of [
      ...buildAxisColumns(g, "left"),
      ...buildAxisColumns(g, "right"),
    ]) {
      const el = this.yAxisLabels_[col.name];
      if (!el || !col.title) {
        continue;
      }
      const textNode = el.children[0]?.children[0];
      if (textNode) {
        textNode.textContent = col.title;
      }
    }
  }

  clearChart() {}

  destroy() {
    this.detachLabels_();
  }
}

/**
 * Place titles inside a gutter strip already reserved for that side.
 * Column layout from the plot edge of the strip: [ticks][title] repeating
 * outward (see axis-chrome). For a left strip, plot edge is strip.x+strip.w;
 * for a right strip, plot edge is strip.x.
 */
const placeSideTitles = (
  g: ZpgraphInstance,
  div: HTMLElement,
  strip: PlotArea,
  cols: AxisColumn[],
  store: Record<string, HTMLElement>,
) => {
  for (const col of cols) {
    if (!col.title || col.titleWidth <= 0) {
      continue;
    }
    const box: PlotArea =
      col.side === "left"
        ? {
            // Left strip: plot is to the right of strip. Outward = smaller x.
            x: strip.x + strip.w - col.offset - col.tickWidth - col.titleWidth,
            y: strip.y,
            w: col.titleWidth,
            h: strip.h,
          }
        : {
            // Right strip: plot is to the left of strip. Outward = larger x.
            x: strip.x + col.offset + col.tickWidth,
            y: strip.y,
            w: col.titleWidth,
            h: strip.h,
          };

    const classes =
      col.index === 0
        ? withClassNames(
            "zpgraph-label zpgraph-ylabel",
            getChartClassNames(g).ylabel,
          )
        : col.index === 1
          ? withClassNames(
              "zpgraph-label zpgraph-y2label",
              getChartClassNames(g).y2label,
            )
          : withClassNames(
              "zpgraph-label zpgraph-ylabel zpgraph-" + col.name + "label",
              getChartClassNames(g).ylabel,
            );

    const el = createRotatedDiv(g, box, col.side, classes, col.title);
    store[col.name] = el;
    div.appendChild(el);
  }
};

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
  side: AxisSide,
  classes: string,
  text: string,
) => {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = box.x + "px";
  div.style.top = box.y + "px";
  div.style.width = box.w + "px";
  div.style.height = box.h + "px";
  div.style.fontSize = g.getNumericOption("yLabelWidth") - 2 + "px";
  // Allow rotated glyphs to paint; box already sits inside the reserved gutter.
  div.style.overflow = "visible";

  const inner_div = document.createElement("div");
  inner_div.style.position = "absolute";
  inner_div.style.width = box.h + "px";
  inner_div.style.height = box.w + "px";
  inner_div.style.top = box.h / 2 - box.w / 2 + "px";
  inner_div.style.left = box.w / 2 - box.h / 2 + "px";
  inner_div.className =
    "zpgraph-label-rotate-" + (side === "left" ? "right" : "left");

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

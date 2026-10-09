"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

/*
Bits of jankiness:
- Direct layout access
- Direct area access
- Should include calculation of ticks, not just the drawing.

Options left to make axis-friendly.
  ('drawAxesAtZero')
  ('xAxisHeight')
*/

import { halfDown, halfUp } from "../utils";
import { getChartClassNames, withClassNames } from "../class-names";
import { axisNameFromIndex } from "../axis-ids";
import {
  buildAxisColumns,
  resolveAxisSide,
  type AxisColumn,
} from "../axis-chrome";
import type { YAxisName } from "../types";
import type {
  ChartDrawPluginEvent,
  LayoutPluginEvent,
  ZpgraphInstance,
} from "../internal-types";

const axisNum = (g: ZpgraphInstance, axis: string, opt: string) =>
  Number(g.getOptionForAxis(opt, axis));

const columnByIndex = (
  cols: AxisColumn[],
): Map<number, AxisColumn> => {
  const m = new Map<number, AxisColumn>();
  for (const c of cols) {
    m.set(c.index, c);
  }
  return m;
};

/**
 * Draws the axes. This includes the labels on the x- and y-axes, as well
 * as the tick marks on the axes.
 * It does _not_ draw the grid lines which span the entire chart.
 */
class axes {
  /** Label divs, reused between draws instead of rebuilt. */
  xlabels_: HTMLElement[] = [];
  ylabels_: HTMLElement[] = [];

  toString() {
    return "Axes Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      layout: this.layout,
      clearChart: this.clearChart,
      willDrawChart: this.willDrawChart,
    };
  }

  layout(e: LayoutPluginEvent) {
    const g = e.zpgraph;

    // Y gutters (ticks + titles) are reserved by ChartLabels, which runs
    // earlier in the reverse plugin cascade. Only the x-axis strip lives here.
    if (g.getOptionForAxis("drawAxis", "x")) {
      let h;
      if (g.getOption("xAxisHeight")) {
        h = g.getNumericOption("xAxisHeight");
      } else {
        h =
          axisNum(g, "x", "axisLabelFontSize") +
          2 * axisNum(g, "x", "axisTickSize");
      }
      e.reserveSpaceBottom(h);
    }
  }

  detachLabels() {
    this.xlabels_.forEach((el) => el.remove());
    this.ylabels_.forEach((el) => el.remove());
    this.xlabels_ = [];
    this.ylabels_ = [];
  }

  trimLabels_(labels: HTMLElement[], count: number) {
    for (const el of labels.slice(count)) {
      el.remove();
    }
    labels.length = count;
  }

  destroy() {
    this.detachLabels();
  }

  clearChart(_e: ChartDrawPluginEvent) {
    // The labels stay: willDrawChart, which runs next, needs the same handful of
    // nodes again with different text, and recreating them every frame is the
    // single largest piece of DOM work in a drag. A draw that wants no labels at
    // all removes them itself.
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    const numAxes = g.numAxes();

    let anyY = false;
    for (let i = 0; i < numAxes; i++) {
      if (
        g.attributes_.seriesForAxis(i).length > 0 &&
        g.getOptionForAxis("drawAxis", axisNameFromIndex(i))
      ) {
        anyY = true;
        break;
      }
    }
    if (!g.getOptionForAxis("drawAxis", "x") && !anyY) {
      this.detachLabels();
      return;
    }

    const context = e.drawingContext;
    const parent = e.canvas.parentNode;
    if (!(parent instanceof HTMLElement)) {
      return;
    }
    const containerDiv = parent;
    const canvasWidth = g.width_; // e.canvas.width is affected by pixel ratio.
    const canvasHeight = g.height_;

    let label, x, y;

    const labelStyleCache: Record<
      string,
      {
        position: string;
        fontSize: string;
        width: string;
      }
    > = {
      x: {
        position: "absolute",
        fontSize: axisNum(g, "x", "axisLabelFontSize") + "px",
        width: axisNum(g, "x", "axisLabelWidth") + "px",
      },
    };
    for (let i = 0; i < numAxes; i++) {
      const name = axisNameFromIndex(i);
      labelStyleCache[name] = {
        position: "absolute",
        fontSize: axisNum(g, name, "axisLabelFontSize") + "px",
        width: axisNum(g, name, "axisLabelWidth") + "px",
      };
    }

    /*
     * `labels[idx]` is the node this slot used on the previous draw, if there
     * was one. Reusing it costs a style reset; recreating it costs two elements
     * and two tree mutations, once per tick per frame.
     */
    const makeDiv = (
      labels: HTMLElement[],
      idx: number,
      txt: string,
      axis: string,
      prec_axis?: string | null,
    ) => {
      let div = labels[idx];
      let inner_div: HTMLElement;
      if (div) {
        const child = div.firstChild;
        if (!(child instanceof HTMLElement)) {
          inner_div = document.createElement("div");
          div.replaceChildren(inner_div);
        } else {
          inner_div = child;
        }
        // Position and alignment are set per draw and differ between slots, so
        // the previous draw's values must not survive into this one.
        div.removeAttribute("style");
      } else {
        div = document.createElement("div");
        inner_div = document.createElement("div");
        div.appendChild(inner_div);
        labels[idx] = div;
        containerDiv.appendChild(div);
      }
      const styleKey =
        prec_axis && labelStyleCache[prec_axis] ? prec_axis : axis;
      const labelStyle = labelStyleCache[styleKey] ?? labelStyleCache.x!;
      div.style.position = labelStyle.position;
      div.style.fontSize = labelStyle.fontSize;
      div.style.width = labelStyle.width;
      inner_div.className = withClassNames(
        "zpgraph-axis-label" +
          " zpgraph-axis-label-" +
          axis +
          (prec_axis ? " zpgraph-axis-label-" + prec_axis : ""),
        getChartClassNames(g).axisLabel,
      );
      // textContent, not innerHTML: tick labels come out of axisLabelFormatter,
      // which callers override with formatters that interpolate their own data.
      inner_div.textContent = txt;
      return div;
    };

    // axis lines
    context.save();

    const layout = g.layout_;
    const area = e.zpgraph.plotter_.area;

    const makeOptionGetter = (axis: string) => (option: string) =>
      axisNum(g, axis, option);

    // Columns: [ticks][title?] from plot outward (see axis-chrome.ts).
    const leftCols = columnByIndex(buildAxisColumns(g, "left"));
    const rightCols = columnByIndex(buildAxisColumns(g, "right"));

    // Counted across the whole draw so that labels left over from a previous one
    // — a tick that disappeared, or an axis that was turned off — are removed
    // even when the branch that would have reused them never runs.
    let yCount = 0,
      xCount = 0;

    if (anyY) {
      if (layout.yticks && layout.yticks.length > 0) {
        layout.yticks.forEach((tick) => {
          if (tick.label === undefined) {
            return;
          }
          const axisIdx = tick.axis;
          if (axisIdx < 0 || axisIdx >= numAxes) {
            return;
          }
          if (g.attributes_.seriesForAxis(axisIdx).length === 0) {
            return;
          }
          const axisName = axisNameFromIndex(axisIdx);
          const getAxisOption = makeOptionGetter(axisName);
          if (!getAxisOption("drawAxis")) {
            return;
          }
          const side = resolveAxisSide(g, axisIdx);
          const fontSize = getAxisOption("axisLabelFontSize");
          y = area.y + tick.pos * area.h;

          // Legacy class: axis 0 → y1, axis 1 → y2, axis n → y(n+1)
          const prec_axis: YAxisName | "y1" =
            axisIdx === 0 ? "y1" : axisNameFromIndex(axisIdx);

          label = makeDiv(
            this.ylabels_,
            yCount++,
            tick.label,
            "y",
            numAxes > 1 ? prec_axis : null,
          );
          let top = y - fontSize / 2;
          if (top < 0) {
            top = 0;
          }

          if (top + fontSize + 3 > canvasHeight) {
            label.style.bottom = "0";
          } else {
            // The lowest tick on the y-axis often overlaps with the leftmost
            // tick on the x-axis. Shift the bottom tick up a little bit to
            // compensate if necessary.
            label.style.top = Math.min(top, canvasHeight - 2 * fontSize) + "px";
          }

          const labelW = getAxisOption("axisLabelWidth");
          const tickSize = getAxisOption("axisTickSize");
          if (side === "left") {
            const col = leftCols.get(axisIdx);
            const offset = col?.offset ?? 0;
            label.style.left = area.x - offset - labelW - tickSize + "px";
            label.style.textAlign = "right";
          } else {
            const col = rightCols.get(axisIdx);
            const offset = col?.offset ?? 0;
            label.style.left = area.x + area.w + offset + tickSize + "px";
            label.style.textAlign = "left";
          }
          label.style.width = labelW + "px";
        });
      }

      // One spine per used side at the plot edge.
      const leftList = buildAxisColumns(g, "left");
      const rightList = buildAxisColumns(g, "right");
      const hasLeft = leftList.length > 0;
      const hasRight = rightList.length > 0;
      const leftSpineAxis = leftList[0]?.name ?? "y";
      const rightSpineAxis = rightList[0]?.name ?? "y2";

      if (hasLeft) {
        let axisX;
        if (g.getOption("drawAxesAtZero")) {
          let r = g.toPercentXCoord(0) ?? 0;
          if (r > 1 || r < 0 || isNaN(r)) {
            r = 0;
          }
          axisX = halfUp(area.x + r * area.w);
        } else {
          axisX = halfUp(area.x);
        }
        context.strokeStyle = String(
          g.getOptionForAxis("axisLineColor", leftSpineAxis),
        );
        context.lineWidth = axisNum(g, leftSpineAxis, "axisLineWidth");
        context.beginPath();
        context.moveTo(axisX, halfDown(area.y));
        context.lineTo(axisX, halfDown(area.y + area.h));
        context.closePath();
        context.stroke();
      }

      if (hasRight) {
        context.strokeStyle = String(
          g.getOptionForAxis("axisLineColor", rightSpineAxis),
        );
        context.lineWidth = axisNum(g, rightSpineAxis, "axisLineWidth");
        context.beginPath();
        context.moveTo(halfDown(area.x + area.w), halfDown(area.y));
        context.lineTo(halfDown(area.x + area.w), halfDown(area.y + area.h));
        context.closePath();
        context.stroke();
      }
    }

    if (g.getOptionForAxis("drawAxis", "x")) {
      if (layout.xticks) {
        const getAxisOption = makeOptionGetter("x");
        layout.xticks.forEach((tick) => {
          if (tick.label === undefined) {
            return;
          }
          x = area.x + tick.pos * area.w;
          y = area.y + area.h;

          label = makeDiv(this.xlabels_, xCount++, tick.label, "x");
          label.style.textAlign = "center";
          label.style.top = y + getAxisOption("axisTickSize") + "px";

          let left = x - getAxisOption("axisLabelWidth") / 2;
          if (left + getAxisOption("axisLabelWidth") > canvasWidth) {
            left = canvasWidth - getAxisOption("axisLabelWidth");
            label.style.textAlign = "right";
          }
          if (left < 0) {
            left = 0;
            label.style.textAlign = "left";
          }

          label.style.left = left + "px";
          label.style.width = getAxisOption("axisLabelWidth") + "px";
        });
      }

      context.strokeStyle = String(g.getOptionForAxis("axisLineColor", "x"));
      context.lineWidth = axisNum(g, "x", "axisLineWidth");
      context.beginPath();
      let axisY;
      if (g.getOption("drawAxesAtZero")) {
        let r = g.toPercentYCoord(0, 0) ?? 1;
        if (r > 1 || r < 0) {
          r = 1;
        }
        axisY = halfDown(area.y + r * area.h);
      } else {
        axisY = halfDown(area.y + area.h);
      }
      context.moveTo(halfUp(area.x), axisY);
      context.lineTo(halfUp(area.x + area.w), axisY);
      context.closePath();
      context.stroke();
    }

    this.trimLabels_(this.ylabels_, yCount);
    this.trimLabels_(this.xlabels_, xCount);

    context.restore();
  }
}

export default axes;

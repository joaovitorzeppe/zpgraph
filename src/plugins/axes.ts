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

import { log } from "../logger";
import * as utils from "../utils";
import type {
  ChartDrawPluginEvent,
  LayoutPluginEvent,
  ZpgraphInstance,
} from "../internal-types";

const axisNum = (g: ZpgraphInstance, axis: "x" | "y" | "y2", opt: string) =>
  Number(g.getOptionForAxis(opt, axis));

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
    let g = e.zpgraph;

    if (g.getOptionForAxis("drawAxis", "y")) {
      let w =
        axisNum(g, "y", "axisLabelWidth") + 2 * axisNum(g, "y", "axisTickSize");
      e.reserveSpaceLeft(w);
    }

    if (g.getOptionForAxis("drawAxis", "x")) {
      let h;
      // NOTE: I think this is probably broken now, since g.getOption() now
      // hits the dictionary. (That is, g.getOption('xAxisHeight') now always
      // has a value.)
      if (g.getOption("xAxisHeight")) {
        h = g.getNumericOption("xAxisHeight");
      } else {
        h =
          axisNum(g, "x", "axisLabelFontSize") +
          2 * axisNum(g, "x", "axisTickSize");
      }
      e.reserveSpaceBottom(h);
    }

    if (g.numAxes() === 2) {
      if (g.getOptionForAxis("drawAxis", "y2")) {
        let w =
          axisNum(g, "y2", "axisLabelWidth") +
          2 * axisNum(g, "y2", "axisTickSize");
        e.reserveSpaceRight(w);
      }
    } else if (g.numAxes() > 2) {
      log.error(
        "Only two y-axes are supported at this time. (Trying " +
          "to use " +
          g.numAxes() +
          ")",
      );
    }
  }

  detachLabels() {
    function removeArray(ary: HTMLElement[]) {
      for (let i = 0; i < ary.length; i++) {
        let el = ary[i]!;
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }

    removeArray(this.xlabels_);
    removeArray(this.ylabels_);
    this.xlabels_ = [];
    this.ylabels_ = [];
  }

  trimLabels_(labels: HTMLElement[], count: number) {
    for (const el of labels.slice(count)) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    labels.length = count;
  }

  clearChart(_e: ChartDrawPluginEvent) {
    // The labels stay: willDrawChart, which runs next, needs the same handful of
    // nodes again with different text, and recreating them every frame is the
    // single largest piece of DOM work in a drag. A draw that wants no labels at
    // all removes them itself.
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    let g = e.zpgraph;

    if (
      !g.getOptionForAxis("drawAxis", "x") &&
      !g.getOptionForAxis("drawAxis", "y") &&
      !g.getOptionForAxis("drawAxis", "y2")
    ) {
      this.detachLabels();
      return;
    }

    // Round pixels to half-integer boundaries for crisper drawing.
    function halfUp(x: number) {
      return Math.round(x) + 0.5;
    }
    function halfDown(y: number) {
      return Math.round(y) - 0.5;
    }

    let context = e.drawingContext;
    let containerDiv = e.canvas.parentNode as HTMLElement;
    let canvasWidth = g.width_; // e.canvas.width is affected by pixel ratio.
    let canvasHeight = g.height_;

    let label, x, y;

    let makeLabelStyle = function (axis: "x" | "y" | "y2") {
      return {
        position: "absolute",
        fontSize: axisNum(g, axis, "axisLabelFontSize") + "px",
        width: axisNum(g, axis, "axisLabelWidth") + "px",
      };
    };

    let labelStyles = {
      x: makeLabelStyle("x"),
      y: makeLabelStyle("y"),
      y2: makeLabelStyle("y2"),
    };

    /*
     * This seems to be called with the following three sets of axis/prec_axis:
     * x: undefined
     * y: y1
     * y: y2
     *
     * `labels[idx]` is the node this slot used on the previous draw, if there
     * was one. Reusing it costs a style reset; recreating it costs two elements
     * and two tree mutations, once per tick per frame.
     */
    let makeDiv = function (
      labels: HTMLElement[],
      idx: number,
      txt: string,
      axis: string,
      prec_axis?: string | null,
    ) {
      let div = labels[idx];
      let inner_div: HTMLElement;
      if (div) {
        inner_div = div.firstChild as HTMLElement;
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
      let labelStyle =
        labelStyles[prec_axis === "y2" ? "y2" : (axis as "x" | "y" | "y2")];
      utils.update(div.style as unknown as Record<string, unknown>, labelStyle);
      inner_div.className =
        "zpgraph-axis-label" +
        " zpgraph-axis-label-" +
        axis +
        (prec_axis ? " zpgraph-axis-label-" + prec_axis : "");
      // textContent, not innerHTML: tick labels come out of axisLabelFormatter,
      // which callers override with formatters that interpolate their own data.
      inner_div.textContent = txt;
      return div;
    };

    // axis lines
    context.save();

    let layout = g.layout_;
    let area = e.zpgraph.plotter_.area;

    // Helper for repeated axis-option accesses.
    let makeOptionGetter = function (axis: "x" | "y" | "y2") {
      return function (option: string) {
        return axisNum(g, axis, option);
      };
    };

    // Counted across the whole draw so that labels left over from a previous one
    // — a tick that disappeared, or an axis that was turned off — are removed
    // even when the branch that would have reused them never runs.
    let yCount = 0,
      xCount = 0;

    if (
      g.getOptionForAxis("drawAxis", "y") ||
      (g.numAxes() === 2 && g.getOptionForAxis("drawAxis", "y2"))
    ) {
      if (layout.yticks && layout.yticks.length > 0) {
        let num_axes = g.numAxes();
        let getOptions = [makeOptionGetter("y"), makeOptionGetter("y2")];
        layout.yticks!.forEach((tick) => {
          if (tick.label === undefined) return; // this tick only has a grid line.
          x = area.x;
          let prec_axis = "y1";
          let getAxisOption = getOptions[0]!;
          if (tick.axis === 1) {
            // right-side y-axis
            x = area.x + area.w;
            prec_axis = "y2";
            getAxisOption = getOptions[1]!;
          }
          if (!getAxisOption("drawAxis")) return;
          let fontSize = getAxisOption("axisLabelFontSize");
          y = area.y + tick.pos * area.h;

          /* Tick marks are currently clipped, so don't bother drawing them.
          context.beginPath();
          context.moveTo(halfUp(x), halfDown(y));
          context.lineTo(halfUp(x - sgn * that.attr_('axisTickSize')), halfDown(y));
          context.closePath();
          context.stroke();
          */

          label = makeDiv(
            this.ylabels_,
            yCount++,
            tick.label,
            "y",
            num_axes === 2 ? prec_axis : null,
          );
          let top = y - fontSize / 2;
          if (top < 0) top = 0;

          if (top + fontSize + 3 > canvasHeight) {
            label.style.bottom = "0";
          } else {
            // The lowest tick on the y-axis often overlaps with the leftmost
            // tick on the x-axis. Shift the bottom tick up a little bit to
            // compensate if necessary.
            label.style.top = Math.min(top, canvasHeight - 2 * fontSize) + "px";
          }
          if (tick.axis === 0) {
            label.style.left =
              area.x -
              getAxisOption("axisLabelWidth") -
              getAxisOption("axisTickSize") +
              "px";
            label.style.textAlign = "right";
          } else if (tick.axis === 1) {
            label.style.left =
              area.x + area.w + getAxisOption("axisTickSize") + "px";
            label.style.textAlign = "left";
          }
          label.style.width = getAxisOption("axisLabelWidth") + "px";
        });
      }

      // draw a vertical line on the left to separate the chart from the labels.
      let axisX;
      if (g.getOption("drawAxesAtZero")) {
        let r = g.toPercentXCoord(0) ?? 0;
        if (r > 1 || r < 0 || isNaN(r)) r = 0;
        axisX = halfUp(area.x + r * area.w);
      } else {
        axisX = halfUp(area.x);
      }

      context.strokeStyle = String(g.getOptionForAxis("axisLineColor", "y"));
      context.lineWidth = axisNum(g, "y", "axisLineWidth");

      context.beginPath();
      context.moveTo(axisX, halfDown(area.y));
      context.lineTo(axisX, halfDown(area.y + area.h));
      context.closePath();
      context.stroke();

      // if there's a secondary y-axis, draw a vertical line for that, too.
      if (g.numAxes() === 2 && g.getOptionForAxis("drawAxis", "y2")) {
        context.strokeStyle = String(g.getOptionForAxis("axisLineColor", "y2"));
        context.lineWidth = axisNum(g, "y2", "axisLineWidth");
        context.beginPath();
        context.moveTo(halfDown(area.x + area.w), halfDown(area.y));
        context.lineTo(halfDown(area.x + area.w), halfDown(area.y + area.h));
        context.closePath();
        context.stroke();
      }
    }

    if (g.getOptionForAxis("drawAxis", "x")) {
      if (layout.xticks) {
        let getAxisOption = makeOptionGetter("x");
        layout.xticks!.forEach((tick) => {
          if (tick.label === undefined) return; // this tick only has a grid line.
          x = area.x + tick.pos * area.w;
          y = area.y + area.h;

          /* Tick marks are currently clipped, so don't bother drawing them.
          context.beginPath();
          context.moveTo(halfUp(x), halfDown(y));
          context.lineTo(halfUp(x), halfDown(y + that.attr_('axisTickSize')));
          context.closePath();
          context.stroke();
          */

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
        if (r > 1 || r < 0) r = 1;
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

/**
 * Drop the labels past `count`, which the draw that just ran did not need.
 * @private
 */

export default axes;

"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

import type { AnnotatedPoint, ChartDrawPluginEvent,ZpgraphInstance } from "../internal-types";
import type { Annotation, AnnotationHandler } from "../types";
import { getChartClassNames, safeCssClasses, withClassNames } from "../class-names";

/**
Current bits of jankiness:
- Uses zpgraph.layout_ to get the parsed annotations.
- Uses zpgraph.plotter_.area

It would be nice if the plugin didn't require so much special support inside
the core zpgraph classes, but annotations involve quite a bit of parsing and
layout.
*/

class annotations {
  /** The label divs of the current draw, so they can be detached on the next. */
  annotations_: HTMLElement[] = [];

  toString() {
    return "Annotations Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      clearChart: this.clearChart,
      didDrawChart: this.didDrawChart,
    };
  }

  detachLabels() {
    for (const a of this.annotations_) {
      a.remove();
    }
    this.annotations_ = [];
  }

  clearChart(_e: ChartDrawPluginEvent) {
    this.detachLabels();
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;

    // Early out in the (common) case of zero annotations.
    const points = g.layout_.annotated_points as AnnotatedPoint[] | undefined;
    if (!points || points.length === 0) {return;}

    const containerDiv = e.canvas.parentNode as HTMLElement;

    const bindEvt = (
      eventName: keyof Pick<
        Annotation,
        | "clickHandler"
        | "mouseOverHandler"
        | "mouseOutHandler"
        | "dblClickHandler"
      >,
      classEventName:
        | "annotationClickHandler"
        | "annotationMouseOverHandler"
        | "annotationMouseOutHandler"
        | "annotationDblClickHandler",
      pt: AnnotatedPoint,
    )  => {
      return function (annotation_event: Event) {
        const mouseEvent = annotation_event as MouseEvent;
        const a = pt.annotation;
        const handler = a[eventName] as AnnotationHandler | undefined;
        if (handler) {
          handler(a, pt, g, mouseEvent);
        } else {
          const fallback = g.getOption(classEventName) as
            | AnnotationHandler
            | undefined;
          fallback?.(a, pt, g, mouseEvent);
        }
      };
    };

    // Add the annotations one-by-one.
    const area = e.zpgraph.getArea();

    // x-coord to sum of previous annotation's heights (used for stacking).
    const xToUsedHeight: Record<number, number> = {};

    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (
        p.canvasx == null ||
        p.canvasy == null ||
        p.canvasx < area.x ||
        p.canvasx > area.x + area.w ||
        p.canvasy < area.y ||
        p.canvasy > area.y + area.h
      ) {
        continue;
      }

      const a = p.annotation;
      let tick_height = 6;
      if (Object.hasOwn(a, "tickHeight")) {
        tick_height = a.tickHeight ?? tick_height;
      }

      // An icon with an unusable URL falls back to the default text annotation
      // rather than rendering an empty box.
      const hasIcon = typeof a.icon === "string" && isSafeIconUrl(a.icon);

      const div = document.createElement("div");
      div.style["fontSize"] = g.getNumericOption("axisLabelFontSize") + "px";
      let className = "zpgraph-annotation";
      if (!hasIcon) {
        // camelCase class names are deprecated.
        className += " zpgraph-default-annotation";
      }
      className = withClassNames(className, getChartClassNames(g).annotation);
      if (Object.hasOwn(a, "cssClass")) {
        const extra = safeCssClasses(a.cssClass);
        if (extra.length) {className += " " + extra.join(" ");}
      }
      div.className = className;

      const width = Object.hasOwn(a, "width") ? (a.width ?? 16) : 16;
      const height = Object.hasOwn(a, "height") ? (a.height ?? 16) : 16;
      if (hasIcon) {
        const img = document.createElement("img");
        img.className = "zpgraph-annotation-icon";
        img.src = a.icon ?? "";
        img.width = width;
        img.height = height;
        img.alt = a.shortText ?? a.text ?? "";
        div.appendChild(img);
      } else if (Object.hasOwn(p.annotation, "shortText")) {
        div.appendChild(document.createTextNode(p.annotation.shortText ?? ""));
      }
      const left = p.canvasx! - width / 2;
      div.style.left = left + "px";
      let divTop = 0;
      let y: number;
      if (a.attachAtBottom) {
        y = area.y + area.h - height - tick_height;
        if (xToUsedHeight[left]) {
          y -= xToUsedHeight[left];
        } else {
          xToUsedHeight[left] = 0;
        }
        xToUsedHeight[left] += tick_height + height;
        divTop = y;
      } else {
        divTop = p.canvasy! - height - tick_height;
      }
      div.style.top = divTop + "px";
      div.style.width = width + "px";
      div.style.height = height + "px";
      div.title = p.annotation.text ?? "";
      div.style.color = g.colorsMap_[p.name] ?? "";
      div.style.borderColor = g.colorsMap_[p.name] ?? "";
      a.div = div;

      g.addAndTrackEvent(
        div,
        "click",
        bindEvt("clickHandler", "annotationClickHandler", p),
      );
      g.addAndTrackEvent(
        div,
        "mouseover",
        bindEvt("mouseOverHandler", "annotationMouseOverHandler", p),
      );
      g.addAndTrackEvent(
        div,
        "mouseout",
        bindEvt("mouseOutHandler", "annotationMouseOutHandler", p),
      );
      g.addAndTrackEvent(
        div,
        "dblclick",
        bindEvt("dblClickHandler", "annotationDblClickHandler", p),
      );

      containerDiv.appendChild(div);
      this.annotations_.push(div);

      const ctx = e.drawingContext;
      ctx.save();
      ctx.strokeStyle = Object.hasOwn(a, "tickColor")
        ? (a.tickColor ?? g.colorsMap_[p.name] ?? "")
        : (g.colorsMap_[p.name] ?? "");
      ctx.lineWidth = Object.hasOwn(a, "tickWidth")
        ? (a.tickWidth ?? g.getNumericOption("strokeWidth"))
        : g.getNumericOption("strokeWidth");
      ctx.beginPath();
      if (!a.attachAtBottom) {
        ctx.moveTo(p.canvasx!, p.canvasy!);
        ctx.lineTo(p.canvasx!, p.canvasy! - 2 - tick_height);
      } else {
        const tickY = divTop + height;
        ctx.moveTo(p.canvasx!, tickY);
        ctx.lineTo(p.canvasx!, tickY + tick_height);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  destroy() {
    this.detachLabels();
  }
}

// Annotations are frequently built from application data, so icon URLs
// reach the DOM from the same place untrusted values do.
const SAFE_ICON_URL = /^(https?:\/\/|\/|\.\/|\.\.\/|data:image\/)/i;

/** @private */
const isSafeIconUrl = (url: unknown): boolean  => {
  return typeof url === "string" && SAFE_ICON_URL.test(url.trim());
};

export default annotations;

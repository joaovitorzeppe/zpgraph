/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Everything the chart builds in the page: the divs and canvases, the roller,
 * the accessibility surface (label, focus, keyboard) and the drag plumbing that
 * routes pointer gestures to the interaction model.
 */

import IFrameTarp from "./iframe-tarp";
import ZpgraphLayout from "./layout";
import { log } from "./logger";
import * as utils from "./utils";
import type {
  ChartInteractionHandler,
  ZpgraphInstance,
} from "./internal-types";
import type { InteractionContext, InteractionModel } from "./types";
import type Zpgraph from "./zpgraph";

/**
 * Generates interface elements for the Zpgraph: a containing div, a div to
 * display the current point, and a textbox to adjust the rolling average
 * period. Also creates the Renderer/Layout elements.
 * @private
 */
export const createInterface = (g: Zpgraph) => {
  // Create the all-enclosing graph div
  let enclosing = g.maindiv_;

  g.graphDiv = document.createElement("div");
  g.graphDiv.className = "zpgraph";

  g.graphDiv.style.textAlign = "left"; // This is a CSS "reset"
  g.graphDiv.style.position = "relative";
  enclosing.appendChild(g.graphDiv);

  // Create the canvas for interactive parts of the chart.
  g.canvas_ = utils.createCanvas();
  g.canvas_.style.position = "absolute";
  g.canvas_.style.top = "0";
  g.canvas_.style.left = "0";

  // ... and for static parts of the chart.
  g.hidden_ = createHiddenCanvas(g, g.canvas_);

  g.canvas_ctx_ = utils.getContext(g.canvas_);
  g.hidden_ctx_ = utils.getContext(g.hidden_);

  resizeElements(g);

  // The interactive parts of the graph are drawn on top of the chart.
  g.graphDiv.appendChild(g.hidden_);
  g.graphDiv.appendChild(g.canvas_);
  g.mouseEventElement_ = createMouseEventElement(g);

  setUpAccessibility(g);

  // Create the grapher
  g.layout_ = new ZpgraphLayout(g as unknown as ZpgraphInstance);

  let zpgraph = g;

  // Hovering repaints the highlight and the legend; one repaint per frame
  // is all that can be seen.
  g.mouseMoveHandler_ = utils.coalesceFrames(function (e: unknown) {
    zpgraph.mouseMove_(e as MouseEvent);
  });
  g.coalesced_.push(g.mouseMoveHandler_);

  g.mouseOutHandler_ = function (e: MouseEvent) {
    // The mouse has left the chart if:
    // 1. e.target is inside the chart
    // 2. e.relatedTarget is outside the chart
    let target = e.target;
    let relatedTarget = e.relatedTarget;
    if (
      utils.isNodeContainedBy(target as Node, zpgraph.graphDiv) &&
      !utils.isNodeContainedBy(relatedTarget as Node, zpgraph.graphDiv)
    ) {
      zpgraph.mouseOut_(e);
    }
  };

  g.addAndTrackEvent(window, "mouseout", g.mouseOutHandler_ as EventListener);
  g.addAndTrackEvent(g.mouseEventElement_, "mousemove", g.mouseMoveHandler_);

  // Don't recreate and register the resize handler on subsequent calls.
  // This happens when the graph is resized.
  if (!g.resizeHandler_) {
    // A window drag emits resize events continuously; each one relayouts
    // the chart from scratch.
    g.resizeHandler_ = utils.coalesceFrames(function () {
      zpgraph.resize();
    });
    g.coalesced_.push(g.resizeHandler_);

    // Update when the window is resized.
    g.addAndTrackEvent(window, "resize", g.resizeHandler_);

    g.resizeObserver_ = null;
    let resizeMode = g.getStringOption("resizable");
    if (typeof ResizeObserver === "undefined" && resizeMode !== "no") {
      log.error("ResizeObserver unavailable; ignoring resizable property");
      resizeMode = "no";
    }
    if (
      resizeMode === "horizontal" ||
      resizeMode === "vertical" ||
      resizeMode === "both"
    ) {
      enclosing.style.resize = resizeMode;
    } else if (resizeMode !== "passive") {
      resizeMode = "no";
    }
    if (resizeMode !== "no") {
      if (window.getComputedStyle(enclosing).overflow === "visible")
        enclosing.style.overflow = "hidden";
      g.resizeObserver_ = new ResizeObserver(g.resizeHandler_);
      g.resizeObserver_.observe(enclosing);
    }
  }
};

export const resizeElements = (g: Zpgraph) => {
  g.graphDiv.style.width = g.width_ + "px";
  g.graphDiv.style.height = g.height_ + "px";

  let pixelRatioOption = g.getNumericOption("pixelRatio");

  let canvasScale =
    pixelRatioOption || utils.getContextPixelRatio(g.canvas_ctx_);
  g.canvas_.width = g.width_ * canvasScale;
  g.canvas_.height = g.height_ * canvasScale;
  g.canvas_.style.width = g.width_ + "px";
  g.canvas_.style.height = g.height_ + "px";
  if (canvasScale !== 1) {
    g.canvas_ctx_.scale(canvasScale, canvasScale);
  }

  let hiddenScale =
    pixelRatioOption || utils.getContextPixelRatio(g.hidden_ctx_);
  g.hidden_.width = g.width_ * hiddenScale;
  g.hidden_.height = g.height_ * hiddenScale;
  g.hidden_.style.width = g.width_ + "px";
  g.hidden_.style.height = g.height_ + "px";
  if (hiddenScale !== 1) {
    g.hidden_ctx_.scale(hiddenScale, hiddenScale);
  }
};

/**
 * Creates the canvas on which the chart will be drawn. Only the Renderer ever
 * draws on this particular canvas. All Zpgraph work (i.e. drawing hover dots
 * or the zoom rectangles) is done on g.canvas_.
 * @param canvas The Zpgraph canvas over which to overlay the plot
 * @return The newly-created canvas
 * @private
 */
export const createHiddenCanvas = (g: Zpgraph, canvas: HTMLCanvasElement) => {
  let h = utils.createCanvas();
  h.style.position = "absolute";
  // Extra area makes zooming the far left/right easier; plot height must stay
  // precise so clipping works.
  h.style.top = canvas.style.top;
  h.style.left = canvas.style.left;
  h.width = g.width_;
  h.height = g.height_;
  h.style.width = g.width_ + "px";
  h.style.height = g.height_ + "px";
  return h;
};

/**
 * Creates an overlay element used to handle mouse events.
 * @return The mouse event element.
 * @private
 */
export const createMouseEventElement = (g: Zpgraph) => {
  return g.canvas_;
};

/**
 * A chart drawn on a canvas is invisible to a screen reader and unreachable
 * by keyboard. Announce it as an image with a description, let it take focus,
 * and answer the arrow keys and Escape.
 * @private
 */
export const setUpAccessibility = (g: Zpgraph) => {
  // The overlay carries the description for both layers; the one beneath it
  // holds the same picture and would only be read twice.
  g.canvas_.setAttribute("role", "img");
  g.hidden_.setAttribute("aria-hidden", "true");
  updateAriaLabel(g);

  // Without this the chart cannot be reached with the keyboard at all.
  g.graphDiv.tabIndex = 0;
  g.keyDownHandler_ = (e: KeyboardEvent) => {
    keyDown(g, e);
  };
  g.addAndTrackEvent(g.graphDiv, "keydown", g.keyDownHandler_ as EventListener);
};

/**
 * Describe the chart in one sentence: what it is, which series it holds and
 * what range of x it currently shows.
 * @private
 */
export const updateAriaLabel = (g: Zpgraph) => {
  if (!g.canvas_) return;

  const parts = [];
  const title = g.getOption("title");
  parts.push(title ? String(title) : "Chart");

  const labels = g.getLabels();
  if (labels && labels.length > 1) {
    parts.push(labels.length - 1 + " series: " + labels.slice(1).join(", "));
  }

  if (g.dateWindow_ || g.rawData_) {
    const range = g.xAxisRange();
    const view = g.optionsViewForAxis_("x");
    const formatter = view("valueFormatter") as (...args: unknown[]) => unknown;
    parts.push(
      "x from " +
        String(formatter.call(g, range[0], view)) +
        " to " +
        String(formatter.call(g, range[1], view)),
    );
  }

  g.canvas_.setAttribute("aria-label", parts.join(". ") + ".");
};

/**
 * Arrows walk the points, Home and End jump to the ends, Escape drops the
 * selection and the zoom. With Shift held, arrows pan or zoom the window.
 * @private
 */
export const keyDown = (g: Zpgraph, e: KeyboardEvent) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const lastRow = g.numRows() - 1;
  if (lastRow < 0) return;

  if (e.shiftKey) {
    const handled = keyDownShift(g, e.key);
    if (handled) e.preventDefault();
    return;
  }

  // The chart resets lastRow_ on every draw, so where the keyboard left off
  // is tracked separately.
  let row = g.keyboardRow_;

  switch (e.key) {
    case "ArrowRight":
      row = row === undefined ? 0 : row + 1;
      break;
    case "ArrowLeft":
      row = row === undefined ? lastRow : row - 1;
      break;
    case "Home":
      row = 0;
      break;
    case "End":
      row = lastRow;
      break;
    case "Escape":
      g.keyboardRow_ = undefined;
      g.clearSelection();
      g.resetZoom();
      e.preventDefault();
      return;
    default:
      return;
  }

  g.keyboardRow_ = Math.max(0, Math.min(lastRow, row));
  g.setSelection(g.keyboardRow_, undefined, false, true);
  e.preventDefault();
};

/** Shift+←/→ pan the x window; Shift+↑/↓ zoom in/out around the center. */
const keyDownShift = (g: Zpgraph, key: string): boolean => {
  const [xMin, xMax] = g.xAxisRange();
  const span = xMax - xMin;
  if (!(span > 0) || !isFinite(span)) return false;

  const extremes = g.xAxisExtremes();
  const panStep = span * 0.1;
  const zoomFactor = 0.8;

  let next: [number, number] | null = null;

  switch (key) {
    case "ArrowLeft":
      next = [xMin - panStep, xMax - panStep];
      break;
    case "ArrowRight":
      next = [xMin + panStep, xMax + panStep];
      break;
    case "ArrowUp": {
      // zoom in
      const mid = (xMin + xMax) / 2;
      const half = (span * zoomFactor) / 2;
      next = [mid - half, mid + half];
      break;
    }
    case "ArrowDown": {
      // zoom out
      const mid = (xMin + xMax) / 2;
      const half = span / zoomFactor / 2;
      next = [mid - half, mid + half];
      break;
    }
    default:
      return false;
  }

  // Clamp to data extremes so pan/zoom cannot leave the series behind.
  let [lo, hi] = next;
  const width = hi - lo;
  if (width >= extremes[1] - extremes[0]) {
    g.resetZoom();
    return true;
  }
  if (lo < extremes[0]) {
    lo = extremes[0];
    hi = lo + width;
  }
  if (hi > extremes[1]) {
    hi = extremes[1];
    lo = hi - width;
  }
  g.updateOptions({ dateWindow: [lo, hi] });
  return true;
};

/**
 * Create the text box to adjust the averaging period
 * @private
 */
export const createRollInterface = (g: Zpgraph) => {
  // Create a roller if one doesn't exist already.
  let roller = g.roller_;
  if (!roller) {
    g.roller_ = roller = document.createElement("input");
    roller.type = "text";
    roller.style.display = "none";
    roller.className = "zpgraph-roller";
    g.graphDiv.appendChild(roller);
  }

  let display = g.getBooleanOption("showRoller") ? "block" : "none";

  let area = g.getArea();
  let textAttr = {
    top: area.y + area.h - 25 + "px",
    left: area.x + 1 + "px",
    display: display,
  };
  roller.size = 2;
  roller.value = String(g.rollPeriod_);
  utils.update(roller.style as unknown as Record<string, unknown>, textAttr);

  const that = g;
  roller.onchange = function onchange() {
    return that.adjustRoll(Number(roller.value));
  };
};

/**
 * Set up all the mouse handlers needed to capture dragging behavior for zoom
 * events.
 * @private
 */
export const createDragInterface = (g: Zpgraph) => {
  let context = {
    // Tracks whether the mouse is down right now
    isZooming: false,
    isPanning: false, // is this drag part of a pan?
    is2DPan: false, // if so, is that pan 1- or 2-dimensional?
    dragStartX: null, // pixel coordinates
    dragStartY: null, // pixel coordinates
    dragEndX: null, // pixel coordinates
    dragEndY: null, // pixel coordinates
    dragDirection: null,
    prevEndX: null, // pixel coordinates
    prevEndY: null, // pixel coordinates
    prevDragDirection: null,
    cancelNextDblclick: false, // see comment in interaction-model.js

    // The value on the left side of the graph when a pan operation starts.
    initialLeftmostDate: null,

    // The number of units each pixel spans. (This won't be valid for log
    // scales)
    xUnitsPerPixel: null,

    // The range in second/value units that the viewport encompasses during a
    // panning operation.
    dateRange: null,

    // Top-left corner of the canvas, in DOM coords
    px: 0,
    py: 0,

    // Values for use with panEdgeFraction, which limit how far outside the
    // graph's data boundaries it can be panned.
    boundedDates: null, // [minDate, maxDate]
    boundedValues: null, // [[minValue, maxValue] ...]

    // Cover iframes during mouse interactions so cross-origin iframes do not
    // steal mouseup. See IFrameTarp.
    tarp: new IFrameTarp(),

    // contextB is the same thing as this context object but renamed.
    initializeMouseDown: function (
      event: Event,
      g: unknown,
      contextB: InteractionContext,
    ) {
      // prevents mouse drags from selecting page text.
      event.preventDefault();

      let canvasPos = utils.findPos((g as ZpgraphInstance).canvas_);
      contextB.px = canvasPos.x;
      contextB.py = canvasPos.y;
      contextB.dragStartX = utils.dragGetX_(
        event as Parameters<typeof utils.dragGetX_>[0],
        contextB,
      );
      contextB.dragStartY = utils.dragGetY_(
        event as Parameters<typeof utils.dragGetY_>[0],
        contextB,
      );
      contextB.cancelNextDblclick = false;
      (contextB.tarp as IFrameTarp).cover();
    },
    destroy: function () {
      if (this.isZooming || this.isPanning) {
        this.isZooming = false;
        this.dragStartX = null;
        this.dragStartY = null;
      }

      if (this.isPanning) {
        this.isPanning = false;
        (this as InteractionContext & { draggingDate?: unknown }).draggingDate =
          null;
        this.dateRange = null;
        for (let i = 0; i < self.axes_.length; i++) {
          delete self.axes_[i]!.draggingValue;
          delete self.axes_[i]!.dragValueRange;
        }
      }

      (this.tarp as IFrameTarp).uncover();
    },
  };

  const interactionModel = g.getOption("interactionModel") as InteractionModel &
    Record<string, unknown>;

  // Self is the graph.
  let self = g;

  // Function that binds the graph and context to the handler.
  let bindHandler = function (handler: ChartInteractionHandler) {
    return function (event: Event) {
      handler(
        event,
        self as unknown as ZpgraphInstance,
        context as InteractionContext,
      );
    };
  };

  let coalescedMoves: utils.Coalesced[] = [];

  for (let eventName in interactionModel) {
    if (!Object.hasOwn(interactionModel, eventName)) continue;
    let bound: utils.Coalesced | ((event: Event) => void) = bindHandler(
      interactionModel[eventName] as ChartInteractionHandler,
    );
    // A move redraws the whole chart, and a finger or a mouse produces far
    // more of them than there are frames to show them in.
    if (eventName === "touchmove" || eventName === "mousemove") {
      const coalesced = utils.coalesceFrames(
        bound as (...args: unknown[]) => void,
      );
      bound = coalesced;
      coalescedMoves.push(coalesced);
      g.coalesced_.push(coalesced);
    } else if (eventName === "touchend" || eventName === "mouseup") {
      // The gesture ends where the last move left it, so that move has to
      // have run before the end handler reads the viewport.
      let end = bound;
      bound = function (event: Event) {
        for (const move of coalescedMoves) move.flush();
        end(event);
      };
    }
    g.addAndTrackEvent(
      g.mouseEventElement_,
      eventName,
      bound as unknown as EventListener,
    );
  }

  // If the user releases the mouse button during a drag, but not over the
  // canvas, then it doesn't count as a zooming action.
  if (!interactionModel.willDestroyContextMyself) {
    let mouseUpHandler = function (_event: Event) {
      context.destroy();
    };

    g.addAndTrackEvent(document, "mouseup", mouseUpHandler);
  }
};

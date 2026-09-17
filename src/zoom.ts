/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Zoom: the rubber-band rectangle drawn during a drag, the window changes it
 * commits, and the animation between the old and the new window.
 */

import * as utils from "./utils";
import type { AxisProperties } from "./internal-types";
import type Zpgraph from "./zpgraph";

/** Frames of the zoom animation, and how long the whole thing lasts. */
const ANIMATION_STEPS = 12;
const ANIMATION_DURATION = 200;

/**
 * Draw a gray zoom rectangle over the desired area of the canvas. Also clears
 * up any previous zoom rectangles that were drawn. This could be optimized to
 * avoid extra redrawing, but it's tricky to avoid interactions with the status
 * dots.
 *
 * @param direction the direction of the zoom rectangle. Acceptable
 *     values are utils.HORIZONTAL and utils.VERTICAL.
 * @param startX The X position where the drag started, in canvas
 *     coordinates.
 * @param endX The current X position of the drag, in canvas coords.
 * @param startY The Y position where the drag started, in canvas
 *     coordinates.
 * @param endY The current Y position of the drag, in canvas coords.
 * @param prevDirection the value of direction on the previous call to
 *     this function. Used to avoid excess redrawing
 * @param prevEndX The value of endX on the previous call to this
 *     function. Used to avoid excess redrawing
 * @param prevEndY The value of endY on the previous call to this
 *     function. Used to avoid excess redrawing
 * @private
 */
export const drawZoomRect = (
  g: Zpgraph,
  direction: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  prevDirection?: number,
  prevEndX?: number,
  prevEndY?: number,
) => {
  const ctx = g.canvas_ctx_;

  // Clean up from the previous rect if necessary
  if (prevDirection === utils.HORIZONTAL) {
    ctx.clearRect(
      Math.min(startX, prevEndX!),
      g.layout_.getPlotArea().y,
      Math.abs(startX - prevEndX!),
      g.layout_.getPlotArea().h,
    );
  } else if (prevDirection === utils.VERTICAL) {
    ctx.clearRect(
      g.layout_.getPlotArea().x,
      Math.min(startY, prevEndY!),
      g.layout_.getPlotArea().w,
      Math.abs(startY - prevEndY!),
    );
  }

  // Draw a light-grey rectangle to show the new viewing area
  if (direction === utils.HORIZONTAL) {
    if (endX && startX) {
      ctx.fillStyle = "rgba(128,128,128,0.33)";
      ctx.fillRect(
        Math.min(startX, endX),
        g.layout_.getPlotArea().y,
        Math.abs(endX - startX),
        g.layout_.getPlotArea().h,
      );
    }
  } else if (direction === utils.VERTICAL) {
    if (endY && startY) {
      ctx.fillStyle = "rgba(128,128,128,0.33)";
      ctx.fillRect(
        g.layout_.getPlotArea().x,
        Math.min(startY, endY),
        g.layout_.getPlotArea().w,
        Math.abs(endY - startY),
      );
    }
  }
};

/**
 * Clear the zoom rectangle (and perform no zoom).
 * @private
 */
export const clearZoomRect = (g: Zpgraph) => {
  g.currentZoomRectArgs_ = null;
  g.canvas_ctx_.clearRect(0, 0, g.width_, g.height_);
};

/**
 * Zoom to something containing [lowX, highX]. These are pixel coordinates in
 * the canvas. The exact zoom window may be slightly larger if there are no data
 * points near lowX or highX. Don't confuse this function with doZoomXDates,
 * which accepts dates that match the raw data. This function redraws the graph.
 *
 * @param lowX The leftmost pixel value that should be visible.
 * @param highX The rightmost pixel value that should be visible.
 * @private
 */
export const doZoomX = (g: Zpgraph, lowX: number, highX: number) => {
  g.currentZoomRectArgs_ = null;
  // Find the earliest and latest dates contained in this canvasx range.
  // Convert the call to date ranges of the raw data.
  const minDate = g.toDataXCoord(lowX);
  const maxDate = g.toDataXCoord(highX);
  doZoomXDates(g, minDate, maxDate);
};

/**
 * Zoom to something containing [minDate, maxDate] values. Don't confuse this
 * method with doZoomX which accepts pixel coordinates. This function redraws
 * the graph.
 *
 * @param minDate The minimum date that should be visible.
 * @param maxDate The maximum date that should be visible.
 * @private
 */
export const doZoomXDates = (
  g: Zpgraph,
  minDate: number | null,
  maxDate: number | null,
) => {
  const old_window = g.xAxisRange();
  const new_window: [number, number] = [minDate!, maxDate!];
  const zoomCallback = g.getFunctionOption("zoomCallback");
  const that = g;
  doAnimatedZoom(
    g,
    old_window,
    new_window,
    null,
    null,
    ()  => {
      if (zoomCallback) {
        zoomCallback.call(that, minDate!, maxDate!, that.yAxisRanges());
      }
    },
  );
};

/**
 * Zoom to something containing [lowY, highY]. These are pixel coordinates in
 * the canvas. This function redraws the graph.
 *
 * @param lowY The topmost pixel value that should be visible.
 * @param highY The lowest pixel value that should be visible.
 * @private
 */
export const doZoomY = (g: Zpgraph, lowY: number, highY: number) => {
  g.currentZoomRectArgs_ = null;
  // Find the highest and lowest values in pixel range for each axis.
  // Note that lowY (in pixels) corresponds to the max Value (in data coords).
  // This is because pixels increase as you go down on the screen, whereas data
  // coordinates increase as you go up the screen.
  const oldValueRanges = g.yAxisRanges();
  const newValueRanges: Array<[number, number] | null> = [];
  for (let i = 0; i < g.axes_.length; i++) {
    const hi = g.toDataYCoord(lowY, i)!;
    const low = g.toDataYCoord(highY, i)!;
    newValueRanges.push([low, hi]);
  }

  const zoomCallback = g.getFunctionOption("zoomCallback");
  const that = g;
  doAnimatedZoom(
    g,
    null,
    null,
    oldValueRanges,
    newValueRanges,
    ()  => {
      if (zoomCallback) {
        const [minX, maxX] = that.xAxisRange();
        zoomCallback.call(that, minX, maxX, that.yAxisRanges());
      }
    },
  );
};

/**
 * Transition function to use in animations. Returns values between 0.0
 * (totally old values) and 1.0 (totally new values) for each frame.
 * @private
 */
const zoomAnimationFunction = (frame: number, numFrames: number) => {
  const k = 1.5;
  return (1.0 - Math.pow(k, -frame)) / (1.0 - Math.pow(k, -numFrames));
};

/**
 * Reset the zoom to the original view coordinates. This is the same as
 * double-clicking on the graph.
 */
export const resetZoom = (g: Zpgraph) => {
  const dirtyX = g.isZoomed("x");
  const dirtyY = g.isZoomed("y");
  const dirty = dirtyX || dirtyY;

  // Clear any selection, since it's likely to be drawn in the wrong place.
  g.clearSelection();

  if (!dirty) {return;}

  // Calculate extremes to avoid lack of padding on reset.
  const [minDate, maxDate] = g.xAxisExtremes();

  const animatedZooms = g.getBooleanOption("animatedZooms");
  const zoomCallback = g.getFunctionOption("zoomCallback");

  if (!animatedZooms) {
    g.dateWindow_ = null;
    g.axes_.forEach((axis: AxisProperties) => {
      if (axis.valueRange) {delete axis.valueRange;}
    });

    g.drawGraph_();
    if (zoomCallback) {
      zoomCallback.call(g, minDate, maxDate, g.yAxisRanges());
    }
    return;
  }

  let oldWindow: [number, number] | null = null,
    newWindow: [number, number] | null = null,
    oldValueRanges: Array<[number, number] | null> | null = null,
    newValueRanges: Array<[number, number] | null> | null = null;
  if (dirtyX) {
    oldWindow = g.xAxisRange();
    newWindow = [minDate, maxDate];
  }

  if (dirtyY) {
    oldValueRanges = g.yAxisRanges();
    newValueRanges = g.yAxisExtremes();
  }

  const that = g;
  doAnimatedZoom(
    g,
    oldWindow,
    newWindow,
    oldValueRanges,
    newValueRanges,
    ()  => {
      that.dateWindow_ = null;
      that.axes_.forEach((axis: AxisProperties) => {
        if (axis.valueRange) {delete axis.valueRange;}
      });
      if (zoomCallback) {
        zoomCallback.call(that, minDate, maxDate, that.yAxisRanges());
      }
    },
  );
};

/**
 * Combined animation logic for all zoom functions.
 * either the x parameters or y parameters may be null.
 * @private
 */
export const doAnimatedZoom = (
  g: Zpgraph,
  oldXRange: [number, number] | null,
  newXRange: [number, number] | null,
  oldYRanges: Array<[number, number] | null> | null,
  newYRanges: Array<[number, number] | null> | null,
  callback: () => void,
) => {
  const steps = g.getBooleanOption("animatedZooms") ? ANIMATION_STEPS : 1;

  const windows: Array<[number, number]> = [];
  const valueRanges: Array<Array<[number, number] | null>> = [];
  let step, frac;

  if (oldXRange !== null && newXRange !== null) {
    for (step = 1; step <= steps; step++) {
      frac = zoomAnimationFunction(step, steps);
      windows[step - 1] = [
        oldXRange[0] * (1 - frac) + frac * newXRange[0],
        oldXRange[1] * (1 - frac) + frac * newXRange[1],
      ];
    }
  }

  if (oldYRanges !== null && newYRanges !== null) {
    for (step = 1; step <= steps; step++) {
      frac = zoomAnimationFunction(step, steps);
      const thisRange: Array<[number, number] | null> = [];
      for (let j = 0; j < g.axes_.length; j++) {
        const oldRange = oldYRanges[j];
        const newRange = newYRanges[j];
        if (!oldRange || !newRange) {
          thisRange.push(null);
          continue;
        }
        thisRange.push([
          oldRange[0] * (1 - frac) + frac * newRange[0],
          oldRange[1] * (1 - frac) + frac * newRange[1],
        ]);
      }
      valueRanges[step - 1] = thisRange;
    }
  }

  const that = g;
  utils.repeatAndCleanup(
    (frame: number) => {
      if (valueRanges.length) {
        for (let i = 0; i < that.axes_.length; i++) {
          const w = valueRanges[frame]?.[i];
          if (!w) {continue;}
          that.axes_[i]!.valueRange = [w[0], w[1]];
        }
      }
      if (windows.length) {
        that.dateWindow_ = windows[frame] ?? null;
      }
      that.drawGraph_();
    },
    steps,
    ANIMATION_DURATION / steps,
    callback,
  );
};

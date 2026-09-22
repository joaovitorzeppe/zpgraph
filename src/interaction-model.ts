"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

import * as utils from "./utils";
import type { InteractionContext, Point } from "./types";
import type { ZpgraphInstance } from "./internal-types";

/**
 * You can drag this many pixels past the edge of the chart and still have it
 * be considered a zoom. This makes it easier to zoom to the exact edge of the
 * g, a fairly common operation.
 */
const DRAG_EDGE_MARGIN = 100;

interface PanAxisData {
  initialTopValue: number;
  dragValueRange: number;
  unitsPerPixel: number;
}

interface TouchPoint {
  pageX: number;
  pageY: number;
  dataX: number | null;
  dataY: number | null;
}

interface TouchSwipe {
  pageX: number;
  pageY: number;
  dataX: number;
  dataY: number;
}

/**
 * A collection of functions to facilitate build custom interaction models.
 * @class
 */
interface ZpgraphInteractionModule {
  maybeTreatMouseOpAsClick: (
    event: MouseEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  startPan: (
    event: MouseEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  movePan: (event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) => void;
  endPan: (event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) => void;
  startZoom: (
    event: MouseEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  moveZoom: (
    event: MouseEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  treatMouseOpAsClick: (
    g: ZpgraphInstance,
    event: MouseEvent,
    context: InteractionContext,
  ) => void;
  endZoom: (event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) => void;
  startTouch: (
    event: TouchEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  moveTouch: (
    event: TouchEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  endTouch: (
    event: TouchEvent,
    g: ZpgraphInstance,
    context: InteractionContext,
  ) => void;
  defaultModel: Record<string, unknown>;
  nonInteractiveModel_: Record<string, unknown>;
  dragIsPanInteractionModel: Record<string, unknown>;
}

const ZpgraphInteraction: ZpgraphInteractionModule = {
  maybeTreatMouseOpAsClick: null!,
  startPan: null!,
  movePan: null!,
  endPan: null!,
  startZoom: null!,
  moveZoom: null!,
  treatMouseOpAsClick: null!,
  endZoom: null!,
  startTouch: null!,
  moveTouch: null!,
  endTouch: null!,
  defaultModel: null!,
  nonInteractiveModel_: null!,
  dragIsPanInteractionModel: null!,
};

/**
 * Checks whether the beginning & ending of an event were close enough that it
 * should be considered a click. If it should, dispatch appropriate events.
 * Returns true if the event was treated as a click.
 *
 * @param event
 * @param g
 * @param context
 */
ZpgraphInteraction.maybeTreatMouseOpAsClick = (
  event: MouseEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  context.dragEndX = utils.dragGetX_(event, context);
  context.dragEndY = utils.dragGetY_(event, context);
  const regionWidth = Math.abs(context.dragEndX - context.dragStartX!);
  const regionHeight = Math.abs(context.dragEndY - context.dragStartY!);

  if (
    regionWidth < 2 &&
    regionHeight < 2 &&
    g.lastx_ !== undefined &&
    g.lastx_ !== null
  ) {
    ZpgraphInteraction.treatMouseOpAsClick(g, event, context);
  }

  context.regionWidth = regionWidth;
  context.regionHeight = regionHeight;
};

/**
 * Called in response to an interaction model operation that
 * should start the default panning behavior.
 *
 * It's used in the default callback for "mousedown" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param event the event object which led to the startPan call.
 * @param g The zpgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.startPan = (
  _event: MouseEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  let i, axis;
  context.isPanning = true;
  const xRange = g.xAxisRange();

  if (g.getOptionForAxis("logscale", "x")) {
    context.initialLeftmostDate = utils.log10(xRange[0]);
    context.dateRange = utils.log10(xRange[1]) - utils.log10(xRange[0]);
  } else {
    context.initialLeftmostDate = xRange[0];
    context.dateRange = xRange[1] - xRange[0];
  }
  context.xUnitsPerPixel = context.dateRange / (g.plotter_.area.w - 1);

  if (g.getNumericOption("panEdgeFraction")) {
    const maxXPixelsToDraw =
      g.width_ * g.getNumericOption("panEdgeFraction");
    const xExtremes = g.xAxisExtremes(); // I REALLY WANT TO CALL THIS xTremes!

    const boundedLeftX = g.toDomXCoord(xExtremes[0])! - maxXPixelsToDraw;
    const boundedRightX = g.toDomXCoord(xExtremes[1])! + maxXPixelsToDraw;

    const boundedLeftDate = g.toDataXCoord(boundedLeftX);
    const boundedRightDate = g.toDataXCoord(boundedRightX);
    context.boundedDates = [boundedLeftDate, boundedRightDate];

    const boundedValues: Array<[number | null, number | null]> = [];
    const maxYPixelsToDraw =
      g.height_ * g.getNumericOption("panEdgeFraction");

    for (i = 0; i < g.axes_.length; i++) {
      axis = g.axes_[i]!;
      const yExtremes = axis.extremeRange!;

      const boundedTopY =
        g.toDomYCoord(yExtremes[0], i)! + maxYPixelsToDraw;
      const boundedBottomY =
        g.toDomYCoord(yExtremes[1], i)! - maxYPixelsToDraw;

      const boundedTopValue = g.toDataYCoord(boundedTopY, i);
      const boundedBottomValue = g.toDataYCoord(boundedBottomY, i);

      boundedValues[i] = [boundedTopValue, boundedBottomValue];
    }
    context.boundedValues = boundedValues;
  } else {
    // undo effect if it was once set
    context.boundedDates = null;
    context.boundedValues = null;
  }

  // Record the range of each y-axis at the start of the context.
  // If any axis has a valueRange, then we want a 2D pan.
  // We can't store data directly in g.axes_, because it does not belong to us
  // and could change out from under us during a pan (say if there's a data
  // update).
  context.is2DPan = false;
  context.axes = [];
  for (i = 0; i < g.axes_.length; i++) {
    axis = g.axes_[i]!;
    const axis_data: PanAxisData = {
      initialTopValue: 0,
      dragValueRange: 0,
      unitsPerPixel: 0,
    };
    const yRange = g.yAxisRange(i);
    if (!yRange) {
      continue;
    }
    // In log scale, initialTopValue, dragValueRange and unitsPerPixel are log scale.
    const logscale = g.attributes_.getForAxis("logscale", i);
    if (logscale) {
      axis_data.initialTopValue = utils.log10(yRange[1]);
      axis_data.dragValueRange =
        utils.log10(yRange[1]) - utils.log10(yRange[0]);
    } else {
      axis_data.initialTopValue = yRange[1];
      axis_data.dragValueRange = yRange[1] - yRange[0];
    }
    axis_data.unitsPerPixel =
      axis_data.dragValueRange / (g.plotter_.area.h - 1);
    context.axes.push(axis_data);

    // While calculating axes, set 2dpan.
    if (axis.valueRange) {
      context.is2DPan = true;
    }
  }
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that pans the view.
 *
 * It's used in the default callback for "mousemove" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param event the event object which led to the movePan call.
 * @param g The zpgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.movePan = (
  event: MouseEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  context.dragEndX = utils.dragGetX_(event, context);
  context.dragEndY = utils.dragGetY_(event, context);

  let minDate =
    context.initialLeftmostDate! -
    (context.dragEndX - context.dragStartX!) * context.xUnitsPerPixel!;
  if (context.boundedDates) {
    const lo = context.boundedDates[0];
    if (lo != null) {
      minDate = Math.max(minDate, lo);
    }
  }
  let maxDate = minDate + context.dateRange!;
  if (context.boundedDates) {
    const hi = context.boundedDates[1];
    if (hi != null && maxDate > hi) {
      // Adjust minDate, and recompute maxDate.
      minDate = minDate - (maxDate - hi);
      maxDate = minDate + context.dateRange!;
    }
  }

  if (g.getOptionForAxis("logscale", "x")) {
    g.dateWindow_ = [
      Math.pow(utils.LOG_SCALE, minDate),
      Math.pow(utils.LOG_SCALE, maxDate),
    ];
  } else {
    g.dateWindow_ = [minDate, maxDate];
  }

  // y-axis scaling is automatic unless this is a full 2D pan.
  if (context.is2DPan) {
    const pixelsDragged = context.dragEndY - context.dragStartY!;

    // Adjust each axis appropriately.
    for (let i = 0; i < g.axes_.length; i++) {
      const axis = g.axes_[i]!;
      const axis_data = context.axes![i]!;
      const unitsDragged = pixelsDragged * axis_data.unitsPerPixel;

      const boundedValue = context.boundedValues ? context.boundedValues[i] : null;

      // In log scale, maxValue and minValue are the logs of those values.
      let maxValue = axis_data.initialTopValue + unitsDragged;
      if (boundedValue) {
        const hi = boundedValue[1];
        if (hi != null) {
          maxValue = Math.min(maxValue, hi);
        }
      }
      let minValue = maxValue - axis_data.dragValueRange;
      if (boundedValue) {
        const lo = boundedValue[0];
        if (lo != null && minValue < lo) {
          // Adjust maxValue, and recompute minValue.
          maxValue = maxValue - (minValue - lo);
          minValue = maxValue - axis_data.dragValueRange;
        }
      }
      if (g.attributes_.getForAxis("logscale", i)) {
        axis.valueRange = [
          Math.pow(utils.LOG_SCALE, minValue),
          Math.pow(utils.LOG_SCALE, maxValue),
        ];
      } else {
        axis.valueRange = [minValue, maxValue];
      }
    }
  }

  g.drawGraph_(false);
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that ends panning.
 *
 * It's used in the default callback for "mouseup" operations.
 * Custom interaction model builders can use it to provide the default
 * panning behavior.
 *
 * @param event the event object which led to the endPan call.
 * @param g The zpgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.endPan = ZpgraphInteraction.maybeTreatMouseOpAsClick;

/**
 * Called in response to an interaction model operation that
 * responds to an event that starts zooming.
 *
 * It's used in the default callback for "mousedown" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param event the event object which led to the startZoom call.
 * @param g The zpgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.startZoom = (
  _event: MouseEvent,
  _g: ZpgraphInstance,
  context: InteractionContext,
) => {
  context.isZooming = true;
  context.zoomMoved = false;
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that defines zoom boundaries.
 *
 * It's used in the default callback for "mousemove" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param event the event object which led to the moveZoom call.
 * @param g The zpgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.moveZoom = (
  event: MouseEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  context.zoomMoved = true;
  context.dragEndX = utils.dragGetX_(event, context);
  context.dragEndY = utils.dragGetY_(event, context);

  const xDelta = Math.abs(context.dragStartX! - context.dragEndX);
  const yDelta = Math.abs(context.dragStartY! - context.dragEndY);

  // drag direction threshold for y axis is twice as large as x axis
  context.dragDirection = xDelta < yDelta / 2 ? utils.VERTICAL : utils.HORIZONTAL;

  g.drawZoomRect_(
    context.dragDirection,
    context.dragStartX!,
    context.dragEndX,
    context.dragStartY!,
    context.dragEndY,
    context.prevDragDirection ?? undefined,
    context.prevEndX ?? undefined,
    context.prevEndY ?? undefined,
  );

  context.prevEndX = context.dragEndX;
  context.prevEndY = context.dragEndY;
  context.prevDragDirection = context.dragDirection;
};

/**
 * @param g
 * @param event
 * @param context
 */
ZpgraphInteraction.treatMouseOpAsClick = (
  g: ZpgraphInstance,
  event: MouseEvent,
  context: InteractionContext,
) => {
  const clickCallback = g.getFunctionOption("clickCallback");
  const pointClickCallback = g.getFunctionOption("pointClickCallback");

  let selectedPoint: Point | null = null;

  // Find out if the click occurs on a point.
  let closestIdx = -1;
  let closestDistance = Number.MAX_VALUE;

  // check if the click was on a particular point.
  for (let i = 0; i < g.selPoints_.length; i++) {
    const p = g.selPoints_[i]!;
    const distance =
      Math.pow(p.canvasx! - context.dragEndX!, 2) +
      Math.pow(p.canvasy! - context.dragEndY!, 2);
    if (!isNaN(distance) && (closestIdx === -1 || distance < closestDistance)) {
      closestDistance = distance;
      closestIdx = i;
    }
  }

  // Allow any click within two pixels of the dot.
  const radius = g.getNumericOption("highlightCircleSize") + 2;
  if (closestDistance <= radius * radius) {
    selectedPoint = g.selPoints_[closestIdx] ?? null;
  }

  if (selectedPoint) {
    const e: Record<string, unknown> = {
      cancelable: true,
      point: selectedPoint,
      canvasx: context.dragEndX!,
      canvasy: context.dragEndY!,
    };
    const defaultPrevented = g.cascadeEvents_("pointClick", e);
    if (defaultPrevented) {
      // Note: this also prevents click / clickCallback from firing.
      return;
    }
    if (pointClickCallback) {
      pointClickCallback.call(g, event, selectedPoint);
    }
  }

  const e: Record<string, unknown> = {
    cancelable: true,
    xval: g.lastx_, // closest point by x value
    pts: g.selPoints_,
    canvasx: context.dragEndX!,
    canvasy: context.dragEndY!,
  };
  if (!g.cascadeEvents_("click", e)) {
    if (clickCallback) {
      clickCallback.call(g, event, g.lastx_, g.selPoints_);
    }
  }
};

/**
 * Called in response to an interaction model operation that
 * responds to an event that performs a zoom based on previously defined
 * bounds..
 *
 * It's used in the default callback for "mouseup" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param event the event object which led to the endZoom call.
 * @param g The zpgraph on which to end the zoom.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZpgraphInteraction.endZoom = (
  event: MouseEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  g.clearZoomRect_();
  context.isZooming = false;
  ZpgraphInteraction.maybeTreatMouseOpAsClick(event, g, context);

  // The zoom rectangle is visibly clipped to the plot area, so its behavior
  // should be as well.
  // See https://code.google.com/archive/p/zpgraph/issues/280
  const plotArea = g.getArea();
  if (context.regionWidth! >= 10 && context.dragDirection === utils.HORIZONTAL) {
    let left = Math.min(context.dragStartX!, context.dragEndX!),
      right = Math.max(context.dragStartX!, context.dragEndX!);
    left = Math.max(left, plotArea.x);
    right = Math.min(right, plotArea.x + plotArea.w);
    if (left < right) {
      g.doZoomX_(left, right);
    }
    context.cancelNextDblclick = true;
  } else if (context.regionHeight! >= 10 && context.dragDirection === utils.VERTICAL) {
    let top = Math.min(context.dragStartY!, context.dragEndY!),
      bottom = Math.max(context.dragStartY!, context.dragEndY!);
    top = Math.max(top, plotArea.y);
    bottom = Math.min(bottom, plotArea.y + plotArea.h);
    if (top < bottom) {
      g.doZoomY_(top, bottom);
    }
    context.cancelNextDblclick = true;
  }
  context.dragStartX = null;
  context.dragStartY = null;
};

/**
 * @private
 */
ZpgraphInteraction.startTouch = (
  event: TouchEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  event.preventDefault(); // touch browsers are all nice.
  if (event.touches.length > 1) {
    // If the user ever puts two fingers down, it's not a double tap.
    context.startTimeForDoubleTapMs = null;
  }

  const touches: TouchPoint[] = [];
  for (let i = 0; i < event.touches.length; i++) {
    const t = event.touches[i]!;
    const target = t.target;
    if (!(target instanceof Element)) {
      continue;
    }
    const rect = target.getBoundingClientRect();
    // we dispense with 'dragGetX_' because all touchBrowsers support pageX
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
      dataX: g.toDataXCoord(t.clientX - rect.left),
      dataY: g.toDataYCoord(t.clientY - rect.top),
      // identifier: t.identifier
    });
  }
  context.initialTouches = touches;

  if (touches.length === 1) {
    // This is just a swipe.
    context.initialPinchCenter = touches[0]!;
    context.touchDirections = { x: true, y: true };
  } else if (touches.length >= 2) {
    // It's become a pinch!
    // In case there are 3+ touches, we ignore all but the "first" two.

    // only screen coordinates can be averaged (data coords could be log scale).
    context.initialPinchCenter = {
      pageX: 0.5 * (touches[0]!.pageX + touches[1]!.pageX),
      pageY: 0.5 * (touches[0]!.pageY + touches[1]!.pageY),

      dataX: 0.5 * (touches[0]!.dataX! + touches[1]!.dataX!),
      dataY: 0.5 * (touches[0]!.dataY! + touches[1]!.dataY!),
    };

    // Make pinches in a 45-degree swath around either axis 1-dimensional zooms.
    let initialAngle =
      (180 / Math.PI) *
      Math.atan2(
        context.initialPinchCenter.pageY - touches[0]!.pageY,
        touches[0]!.pageX - context.initialPinchCenter.pageX,
      );

    // use symmetry to get it into the first quadrant.
    initialAngle = Math.abs(initialAngle);
    if (initialAngle > 90) {
      initialAngle = 90 - initialAngle;
    }

    context.touchDirections = {
      x: initialAngle < 90 - 45 / 2,
      y: initialAngle > 45 / 2,
    };
  }

  // save the full x & y ranges.
  context.initialRange = {
    x: g.xAxisRange(),
    y: g.yAxisRange() ?? g.xAxisRange(),
  };
};

/**
 * @private
 */
ZpgraphInteraction.moveTouch = (
  event: TouchEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  // If the tap moves, then it's definitely not part of a double-tap.
  context.startTimeForDoubleTapMs = null;

  let i;
  const touches: Array<{ pageX: number; pageY: number }> = [];
  for (i = 0; i < event.touches.length; i++) {
    const t = event.touches[i]!;
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
    });
  }
  const initialTouches = context.initialTouches!;

  let c_now: TouchPoint;

  // old and new centers.
  const c_init = context.initialPinchCenter!;
  if (touches.length === 1) {
    c_now = {
      pageX: touches[0]!.pageX,
      pageY: touches[0]!.pageY,
      dataX: c_init.dataX,
      dataY: c_init.dataY,
    };
  } else {
    c_now = {
      pageX: 0.5 * (touches[0]!.pageX + touches[1]!.pageX),
      pageY: 0.5 * (touches[0]!.pageY + touches[1]!.pageY),
      dataX: 0.5 * (initialTouches[0]!.dataX! + initialTouches[1]!.dataX!),
      dataY: 0.5 * (initialTouches[0]!.dataY! + initialTouches[1]!.dataY!),
    };
  }

  // this is the "swipe" component
  // we toss it out for now, but could use it in the future.
  const swipe: TouchSwipe = {
    pageX: c_now.pageX - c_init.pageX,
    pageY: c_now.pageY - c_init.pageY,
    dataX: 0,
    dataY: 0,
  };
  const dataWidth = context.initialRange!.x[1] - context.initialRange!.x[0];
  const dataHeight = context.initialRange!.y[0] - context.initialRange!.y[1];
  swipe.dataX = (swipe.pageX / g.plotter_.area.w) * dataWidth;
  swipe.dataY = (swipe.pageY / g.plotter_.area.h) * dataHeight;
  let xScale = 1.0,
    yScale = 1.0;

  // The residual bits are usually split into scale & rotate bits, but we split
  // them into x-scale and y-scale bits.
  if (touches.length === 1) {
    xScale = 1.0;
    yScale = 1.0;
  } else if (touches.length >= 2) {
    const initHalfWidth = initialTouches[1]!.pageX - c_init.pageX;
    xScale = (touches[1]!.pageX - c_now.pageX) / initHalfWidth;

    const initHalfHeight = initialTouches[1]!.pageY - c_init.pageY;
    yScale = (touches[1]!.pageY - c_now.pageY) / initHalfHeight;
  }

  // Clip scaling to [1/8, 8] to prevent too much blowup.
  xScale = Math.min(8, Math.max(0.125, xScale));
  yScale = Math.min(8, Math.max(0.125, yScale));

  let didZoom = false;
  if (context.touchDirections!.x) {
    const cFactor = c_init.dataX! - swipe.dataX / xScale;
    g.dateWindow_ = [
      cFactor + (context.initialRange!.x[0] - c_init.dataX!) / xScale,
      cFactor + (context.initialRange!.x[1] - c_init.dataX!) / xScale,
    ];
    didZoom = true;
  }

  if (context.touchDirections!.y) {
    for (i = 0; i < 1 /*g.axes_.length*/; i++) {
      const axis = g.axes_[i]!;
      const logscale = g.attributes_.getForAxis("logscale", i);
      if (logscale) {
        // Log-scale y pinch zoom not implemented yet.
      } else {
        const cFactor = c_init.dataY! - swipe.dataY / yScale;
        axis.valueRange = [
          cFactor + (context.initialRange!.y[0] - c_init.dataY!) / yScale,
          cFactor + (context.initialRange!.y[1] - c_init.dataY!) / yScale,
        ];
        didZoom = true;
      }
    }
  }

  g.drawGraph_(false);

  // We only call zoomCallback on zooms, not pans, to mirror desktop behavior.
  const zoomCallback = g.getFunctionOption("zoomCallback");
  if (didZoom && touches.length > 1 && zoomCallback) {
    const viewWindow = g.xAxisRange();
    zoomCallback.call(g, viewWindow[0], viewWindow[1], g.yAxisRanges());
  }
};

/**
 * @private
 */
ZpgraphInteraction.endTouch = (
  event: TouchEvent,
  g: ZpgraphInstance,
  context: InteractionContext,
) => {
  if (event.touches.length !== 0) {
    // this is effectively a "reset"
    ZpgraphInteraction.startTouch(event, g, context);
  } else if (event.changedTouches.length === 1) {
    // Could be part of a "double tap"
    // The heuristic here is that it's a double-tap if the two touchend events
    // occur within 500ms and within a 50x50 pixel box.
    const now = new Date().getTime();
    const t = event.changedTouches[0]!;
    if (
      context.startTimeForDoubleTapMs &&
      now - context.startTimeForDoubleTapMs < 500 &&
      context.doubleTapX &&
      Math.abs(context.doubleTapX - t.screenX) < 50 &&
      context.doubleTapY &&
      Math.abs(context.doubleTapY - t.screenY) < 50
    ) {
      g.resetZoom();
    } else {
      context.startTimeForDoubleTapMs = now;
      context.doubleTapX = t.screenX;
      context.doubleTapY = t.screenY;
    }
  }
};

// Determine the distance from x to [left, right].
const distanceFromInterval = (x: number, left: number, right: number) => {
  if (x < left) {
    return left - x;
  } else if (x > right) {
    return x - right;
  }
  return 0;
};

/**
 * Returns the number of pixels by which the event happens from the nearest
 * edge of the chart. For events in the interior of the chart, this returns zero.
 */
const distanceFromChart = (event: MouseEvent, g: ZpgraphInstance) => {
  const chartPos = utils.findPos(g.canvas_);
  const box = {
    left: chartPos.x,
    right: chartPos.x + g.canvas_.offsetWidth,
    top: chartPos.y,
    bottom: chartPos.y + g.canvas_.offsetHeight,
  };

  const pt = {
    x: utils.pageX(event),
    y: utils.pageY(event),
  };

  const dx = distanceFromInterval(pt.x, box.left, box.right),
    dy = distanceFromInterval(pt.y, box.top, box.bottom);
  return Math.max(dx, dy);
};

/**
 * Default interation model for zpgraph. You can refer to specific elements of
 * this when constructing your own interaction model, e.g.:
 * g.updateOptions( {
 *   interactionModel: {
 *     mousedown: ZpgraphInteraction.defaultInteractionModel.mousedown
 *   }
 * } );
 */
ZpgraphInteraction.defaultModel = {
  // Track the beginning of drag events
  mousedown(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    // Right-click should not initiate a zoom.
    if (event.button && event.button === 2) {
      return;
    }

    context.initializeMouseDown(event, g, context);

    if (event.altKey || event.shiftKey) {
      ZpgraphInteraction.startPan(event, g, context);
    } else {
      ZpgraphInteraction.startZoom(event, g, context);
    }

    // Note: we register mousemove/mouseup on document to allow some leeway for
    // events to move outside of the chart. Interaction model events get
    // registered on the canvas, which is too small to allow this.
    // Coalesced: a drag delivers several mousemoves per frame, and each one
    // used to repaint the whole chart. Only the last one in a frame is ever
    // seen. The gesture state itself still updates inside the redraw, so a
    // read of dateWindow lands on the position of the last event handled.
    const mousemove = utils.coalesceFrames((moveEvent: MouseEvent) => {
      if (context.isZooming) {
        // When the mouse moves >200px from the chart edge, cancel the zoom.
        const d = distanceFromChart(moveEvent, g);
        if (d < DRAG_EDGE_MARGIN) {
          ZpgraphInteraction.moveZoom(moveEvent, g, context);
        } else {
          if (context.dragEndX !== null) {
            context.dragEndX = null;
            context.dragEndY = null;
            g.clearZoomRect_();
          }
        }
      } else if (context.isPanning) {
        ZpgraphInteraction.movePan(moveEvent, g, context);
      }
    });
    const mouseup: EventListener = (rawUp) => {
      if (!(rawUp instanceof MouseEvent)) {
        return;
      }
      const upEvent = rawUp;
      // endZoom reads the dragEnd set by moveZoom, so the last move of the
      // gesture has to have run before the gesture ends.
      mousemove.flush();
      if (context.isZooming) {
        if (context.dragEndX !== null) {
          ZpgraphInteraction.endZoom(upEvent, g, context);
        } else {
          ZpgraphInteraction.maybeTreatMouseOpAsClick(upEvent, g, context);
        }
      } else if (context.isPanning) {
        ZpgraphInteraction.endPan(upEvent, g, context);
      }

      utils.removeEvent(document, "mousemove", mousemove);
      utils.removeEvent(document, "mouseup", mouseup);
      context.destroy?.();
    };

    g.addAndTrackEvent(document, "mousemove", mousemove);
    g.addAndTrackEvent(document, "mouseup", mouseup);
  },
  willDestroyContextMyself: true,

  touchstart(event: TouchEvent, g: ZpgraphInstance, context: InteractionContext) {
    ZpgraphInteraction.startTouch(event, g, context);
  },
  touchmove(event: TouchEvent, g: ZpgraphInstance, context: InteractionContext) {
    ZpgraphInteraction.moveTouch(event, g, context);
  },
  touchend(event: TouchEvent, g: ZpgraphInstance, context: InteractionContext) {
    ZpgraphInteraction.endTouch(event, g, context);
  },

  // Disable zooming out if panning.
  dblclick(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    if (context.cancelNextDblclick) {
      context.cancelNextDblclick = false;
      return;
    }

    // Give plugins a chance to grab this event.
    const e: Record<string, unknown> = {
      canvasx: context.dragEndX,
      canvasy: context.dragEndY,
      cancelable: true,
    };
    if (g.cascadeEvents_("dblclick", e)) {
      return;
    }

    if (event.altKey || event.shiftKey) {
      return;
    }
    g.resetZoom();
  },
};

/*
Zpgraph.DEFAULT_ATTRS.interactionModel = ZpgraphInteraction.defaultModel;

// old ways of accessing these methods/properties
Zpgraph.defaultInteractionModel = ZpgraphInteraction.defaultModel;
Zpgraph.endZoom = ZpgraphInteraction.endZoom;
Zpgraph.moveZoom = ZpgraphInteraction.moveZoom;
Zpgraph.startZoom = ZpgraphInteraction.startZoom;
Zpgraph.endPan = ZpgraphInteraction.endPan;
Zpgraph.movePan = ZpgraphInteraction.movePan;
Zpgraph.startPan = ZpgraphInteraction.startPan;
*/

ZpgraphInteraction.nonInteractiveModel_ = {
  mousedown(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    context.initializeMouseDown(event, g, context);
  },
  mouseup: ZpgraphInteraction.maybeTreatMouseOpAsClick,
};

// Default interaction model when using the range selector.
ZpgraphInteraction.dragIsPanInteractionModel = {
  mousedown(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    context.initializeMouseDown(event, g, context);
    ZpgraphInteraction.startPan(event, g, context);
  },
  mousemove(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    if (context.isPanning) {
      ZpgraphInteraction.movePan(event, g, context);
    }
  },
  mouseup(event: MouseEvent, g: ZpgraphInstance, context: InteractionContext) {
    if (context.isPanning) {
      ZpgraphInteraction.endPan(event, g, context);
    }
  },
};

export default ZpgraphInteraction;

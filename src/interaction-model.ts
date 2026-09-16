'use strict';

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zgraph:false */

import * as utils from './utils';
import type { InteractionContext, Point } from './types';
import type { ZgraphInstance } from './internal-types';

/**
 * You can drag this many pixels past the edge of the chart and still have it
 * be considered a zoom. This makes it easier to zoom to the exact edge of the
 * chart, a fairly common operation.
 */
let DRAG_EDGE_MARGIN = 100;

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

/** Drag/zoom fields stored on InteractionContext during gestures. */
interface DragContext extends InteractionContext {
  dragStartX: number | null;
  dragStartY: number | null;
  dragEndX: number | null;
  dragEndY: number | null;
  dateRange: number;
  initialLeftmostDate: number;
  xUnitsPerPixel: number;
  boundedDates: [number | null, number | null] | null;
  boundedValues: Array<[number | null, number | null]> | null;
  axes: PanAxisData[];
  regionWidth: number;
  regionHeight: number;
  dragDirection: number;
  prevDragDirection?: number;
  prevEndX?: number;
  prevEndY?: number;
  initialTouches?: TouchPoint[];
  initialPinchCenter?: TouchPoint;
  touchDirections?: { x: boolean; y: boolean };
  initialRange?: { x: [number, number]; y: [number, number] };
  startTimeForDoubleTapMs?: number | null;
  doubleTapX?: number;
  doubleTapY?: number;
}

/**
 * A collection of functions to facilitate build custom interaction models.
 * @class
 */
interface ZgraphInteractionModule {
  maybeTreatMouseOpAsClick: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  startPan: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  movePan: (event: MouseEvent, g: unknown, context: InteractionContext) => void;
  endPan: (event: MouseEvent, g: unknown, context: InteractionContext) => void;
  startZoom: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  moveZoom: (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  treatMouseOpAsClick: (
    g: unknown,
    event: MouseEvent,
    context: InteractionContext,
  ) => void;
  endZoom: (event: MouseEvent, g: unknown, context: InteractionContext) => void;
  startTouch: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  moveTouch: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  endTouch: (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) => void;
  defaultModel: Record<string, unknown>;
  nonInteractiveModel_: Record<string, unknown>;
  dragIsPanInteractionModel: Record<string, unknown>;
}

const ZgraphInteraction = {} as ZgraphInteractionModule;

/**
 * Checks whether the beginning & ending of an event were close enough that it
 * should be considered a click. If it should, dispatch appropriate events.
 * Returns true if the event was treated as a click.
 *
 * @param event
 * @param g
 * @param context
 */
ZgraphInteraction.maybeTreatMouseOpAsClick = function (
  event: MouseEvent,
  g: unknown,
  context: InteractionContext,
) {
  const drag = context as DragContext;
  drag.dragEndX = utils.dragGetX_(event, context);
  drag.dragEndY = utils.dragGetY_(event, context);
  let regionWidth = Math.abs(drag.dragEndX! - drag.dragStartX!);
  let regionHeight = Math.abs(drag.dragEndY! - drag.dragStartY!);

  if (
    regionWidth < 2 &&
    regionHeight < 2 &&
    (g as ZgraphInstance).lastx_ !== undefined &&
    (g as ZgraphInstance).lastx_ !== null
  ) {
    ZgraphInteraction.treatMouseOpAsClick(g, event, context);
  }

  drag.regionWidth = regionWidth;
  drag.regionHeight = regionHeight;
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
 * @param g The zgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.startPan = function (
  event: MouseEvent,
  g: unknown,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  let i, axis;
  drag.isPanning = true;
  let xRange = chart.xAxisRange();

  if (chart.getOptionForAxis('logscale', 'x')) {
    drag.initialLeftmostDate = utils.log10(xRange[0]);
    drag.dateRange = utils.log10(xRange[1]) - utils.log10(xRange[0]);
  } else {
    drag.initialLeftmostDate = xRange[0];
    drag.dateRange = xRange[1] - xRange[0];
  }
  drag.xUnitsPerPixel = drag.dateRange / (chart.plotter_.area.w - 1);

  if (chart.getNumericOption('panEdgeFraction')) {
    let maxXPixelsToDraw =
      chart.width_ * chart.getNumericOption('panEdgeFraction');
    let xExtremes = chart.xAxisExtremes(); // I REALLY WANT TO CALL THIS xTremes!

    let boundedLeftX = chart.toDomXCoord(xExtremes[0])! - maxXPixelsToDraw;
    let boundedRightX = chart.toDomXCoord(xExtremes[1])! + maxXPixelsToDraw;

    let boundedLeftDate = chart.toDataXCoord(boundedLeftX);
    let boundedRightDate = chart.toDataXCoord(boundedRightX);
    drag.boundedDates = [boundedLeftDate, boundedRightDate];

    let boundedValues: Array<[number | null, number | null]> = [];
    let maxYPixelsToDraw =
      chart.height_ * chart.getNumericOption('panEdgeFraction');

    for (i = 0; i < chart.axes_.length; i++) {
      axis = chart.axes_[i]!;
      let yExtremes = axis.extremeRange!;

      let boundedTopY = chart.toDomYCoord(yExtremes[0], i)! + maxYPixelsToDraw;
      let boundedBottomY =
        chart.toDomYCoord(yExtremes[1], i)! - maxYPixelsToDraw;

      let boundedTopValue = chart.toDataYCoord(boundedTopY, i);
      let boundedBottomValue = chart.toDataYCoord(boundedBottomY, i);

      boundedValues[i] = [boundedTopValue, boundedBottomValue];
    }
    drag.boundedValues = boundedValues;
  } else {
    // undo effect if it was once set
    drag.boundedDates = null;
    drag.boundedValues = null;
  }

  // Record the range of each y-axis at the start of the drag.
  // If any axis has a valueRange, then we want a 2D pan.
  // We can't store data directly in g.axes_, because it does not belong to us
  // and could change out from under us during a pan (say if there's a data
  // update).
  drag.is2DPan = false;
  drag.axes = [];
  for (i = 0; i < chart.axes_.length; i++) {
    axis = chart.axes_[i]!;
    let axis_data: PanAxisData = {
      initialTopValue: 0,
      dragValueRange: 0,
      unitsPerPixel: 0,
    };
    let yRange = chart.yAxisRange(i);
    if (!yRange) continue;
    // In log scale, initialTopValue, dragValueRange and unitsPerPixel are log scale.
    let logscale = chart.attributes_.getForAxis('logscale', i);
    if (logscale) {
      axis_data.initialTopValue = utils.log10(yRange[1]);
      axis_data.dragValueRange =
        utils.log10(yRange[1]) - utils.log10(yRange[0]);
    } else {
      axis_data.initialTopValue = yRange[1];
      axis_data.dragValueRange = yRange[1] - yRange[0];
    }
    axis_data.unitsPerPixel =
      axis_data.dragValueRange / (chart.plotter_.area.h - 1);
    drag.axes.push(axis_data);

    // While calculating axes, set 2dpan.
    if (axis.valueRange) drag.is2DPan = true;
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
 * @param g The zgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.movePan = function (
  event: MouseEvent,
  g: unknown,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  drag.dragEndX = utils.dragGetX_(event, context);
  drag.dragEndY = utils.dragGetY_(event, context);

  let minDate =
    drag.initialLeftmostDate -
    (drag.dragEndX! - drag.dragStartX!) * drag.xUnitsPerPixel;
  if (drag.boundedDates) {
    const lo = drag.boundedDates[0];
    if (lo != null) minDate = Math.max(minDate, lo);
  }
  let maxDate = minDate + drag.dateRange;
  if (drag.boundedDates) {
    const hi = drag.boundedDates[1];
    if (hi != null && maxDate > hi) {
      // Adjust minDate, and recompute maxDate.
      minDate = minDate - (maxDate - hi);
      maxDate = minDate + drag.dateRange;
    }
  }

  if (chart.getOptionForAxis('logscale', 'x')) {
    chart.dateWindow_ = [
      Math.pow(utils.LOG_SCALE, minDate),
      Math.pow(utils.LOG_SCALE, maxDate),
    ];
  } else {
    chart.dateWindow_ = [minDate, maxDate];
  }

  // y-axis scaling is automatic unless this is a full 2D pan.
  if (drag.is2DPan) {
    let pixelsDragged = drag.dragEndY! - drag.dragStartY!;

    // Adjust each axis appropriately.
    for (let i = 0; i < chart.axes_.length; i++) {
      let axis = chart.axes_[i]!;
      let axis_data = drag.axes[i]!;
      let unitsDragged = pixelsDragged * axis_data.unitsPerPixel;

      let boundedValue = drag.boundedValues ? drag.boundedValues[i] : null;

      // In log scale, maxValue and minValue are the logs of those values.
      let maxValue = axis_data.initialTopValue + unitsDragged;
      if (boundedValue) {
        const hi = boundedValue[1];
        if (hi != null) maxValue = Math.min(maxValue, hi);
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
      if (chart.attributes_.getForAxis('logscale', i)) {
        axis.valueRange = [
          Math.pow(utils.LOG_SCALE, minValue),
          Math.pow(utils.LOG_SCALE, maxValue),
        ];
      } else {
        axis.valueRange = [minValue, maxValue];
      }
    }
  }

  chart.drawGraph_(false);
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
 * @param g The zgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.endPan = ZgraphInteraction.maybeTreatMouseOpAsClick;

/**
 * Called in response to an interaction model operation that
 * responds to an event that starts zooming.
 *
 * It's used in the default callback for "mousedown" operations.
 * Custom interaction model builders can use it to provide the default
 * zooming behavior.
 *
 * @param event the event object which led to the startZoom call.
 * @param g The zgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.startZoom = function (
  _event: MouseEvent,
  _g: unknown,
  context: InteractionContext,
) {
  const drag = context as DragContext;
  drag.isZooming = true;
  drag.zoomMoved = false;
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
 * @param g The zgraph on which to act.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.moveZoom = function (
  event: MouseEvent,
  g: unknown,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  drag.zoomMoved = true;
  drag.dragEndX = utils.dragGetX_(event, context);
  drag.dragEndY = utils.dragGetY_(event, context);

  let xDelta = Math.abs(drag.dragStartX! - drag.dragEndX!);
  let yDelta = Math.abs(drag.dragStartY! - drag.dragEndY!);

  // drag direction threshold for y axis is twice as large as x axis
  drag.dragDirection = xDelta < yDelta / 2 ? utils.VERTICAL : utils.HORIZONTAL;

  chart.drawZoomRect_(
    drag.dragDirection,
    drag.dragStartX!,
    drag.dragEndX!,
    drag.dragStartY!,
    drag.dragEndY!,
    drag.prevDragDirection,
    drag.prevEndX,
    drag.prevEndY,
  );

  drag.prevEndX = drag.dragEndX;
  drag.prevEndY = drag.dragEndY;
  drag.prevDragDirection = drag.dragDirection;
};

/**
 * @param g
 * @param event
 * @param context
 */
ZgraphInteraction.treatMouseOpAsClick = function (
  g: unknown,
  event: MouseEvent,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  let clickCallback = chart.getFunctionOption('clickCallback');
  let pointClickCallback = chart.getFunctionOption('pointClickCallback');

  let selectedPoint: Point | null = null;

  // Find out if the click occurs on a point.
  let closestIdx = -1;
  let closestDistance = Number.MAX_VALUE;

  // check if the click was on a particular point.
  for (let i = 0; i < chart.selPoints_.length; i++) {
    let p = chart.selPoints_[i]!;
    let distance =
      Math.pow(p.canvasx! - drag.dragEndX!, 2) +
      Math.pow(p.canvasy! - drag.dragEndY!, 2);
    if (!isNaN(distance) && (closestIdx === -1 || distance < closestDistance)) {
      closestDistance = distance;
      closestIdx = i;
    }
  }

  // Allow any click within two pixels of the dot.
  let radius = chart.getNumericOption('highlightCircleSize') + 2;
  if (closestDistance <= radius * radius) {
    selectedPoint = chart.selPoints_[closestIdx] ?? null;
  }

  if (selectedPoint) {
    let e: Record<string, unknown> = {
      cancelable: true,
      point: selectedPoint,
      canvasx: drag.dragEndX!,
      canvasy: drag.dragEndY!,
    };
    let defaultPrevented = chart.cascadeEvents_('pointClick', e);
    if (defaultPrevented) {
      // Note: this also prevents click / clickCallback from firing.
      return;
    }
    if (pointClickCallback) {
      pointClickCallback.call(chart, event, selectedPoint);
    }
  }

  let e: Record<string, unknown> = {
    cancelable: true,
    xval: chart.lastx_, // closest point by x value
    pts: chart.selPoints_,
    canvasx: drag.dragEndX!,
    canvasy: drag.dragEndY!,
  };
  if (!chart.cascadeEvents_('click', e)) {
    if (clickCallback) {
      clickCallback.call(chart, event, chart.lastx_, chart.selPoints_);
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
 * @param g The zgraph on which to end the zoom.
 * @param context The dragging context object (with
 *     dragStartX/dragStartY/etc. properties). This function modifies the
 *     context.
 */
ZgraphInteraction.endZoom = function (
  event: MouseEvent,
  g: unknown,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  chart.clearZoomRect_();
  drag.isZooming = false;
  ZgraphInteraction.maybeTreatMouseOpAsClick(event, g, context);

  // The zoom rectangle is visibly clipped to the plot area, so its behavior
  // should be as well.
  // See https://code.google.com/archive/p/zgraph/issues/280
  let plotArea = chart.getArea();
  if (drag.regionWidth >= 10 && drag.dragDirection === utils.HORIZONTAL) {
    let left = Math.min(drag.dragStartX!, drag.dragEndX!),
      right = Math.max(drag.dragStartX!, drag.dragEndX!);
    left = Math.max(left, plotArea.x);
    right = Math.min(right, plotArea.x + plotArea.w);
    if (left < right) {
      chart.doZoomX_(left, right);
    }
    drag.cancelNextDblclick = true;
  } else if (drag.regionHeight >= 10 && drag.dragDirection === utils.VERTICAL) {
    let top = Math.min(drag.dragStartY!, drag.dragEndY!),
      bottom = Math.max(drag.dragStartY!, drag.dragEndY!);
    top = Math.max(top, plotArea.y);
    bottom = Math.min(bottom, plotArea.y + plotArea.h);
    if (top < bottom) {
      chart.doZoomY_(top, bottom);
    }
    drag.cancelNextDblclick = true;
  }
  drag.dragStartX = null;
  drag.dragStartY = null;
};

/**
 * @private
 */
ZgraphInteraction.startTouch = function (
  event: TouchEvent,
  g: unknown,
  context: InteractionContext,
) {
  const drag = context as DragContext;
  const chart = g as ZgraphInstance;
  event.preventDefault(); // touch browsers are all nice.
  if (event.touches.length > 1) {
    // If the user ever puts two fingers down, it's not a double tap.
    drag.startTimeForDoubleTapMs = null;
  }

  const touches: TouchPoint[] = [];
  for (let i = 0; i < event.touches.length; i++) {
    let t = event.touches[i]!;
    let rect = (t.target as Element).getBoundingClientRect();
    // we dispense with 'dragGetX_' because all touchBrowsers support pageX
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
      dataX: chart.toDataXCoord(t.clientX - rect.left),
      dataY: chart.toDataYCoord(t.clientY - rect.top),
      // identifier: t.identifier
    });
  }
  drag.initialTouches = touches;

  if (touches.length === 1) {
    // This is just a swipe.
    drag.initialPinchCenter = touches[0]!;
    drag.touchDirections = { x: true, y: true };
  } else if (touches.length >= 2) {
    // It's become a pinch!
    // In case there are 3+ touches, we ignore all but the "first" two.

    // only screen coordinates can be averaged (data coords could be log scale).
    drag.initialPinchCenter = {
      pageX: 0.5 * (touches[0]!.pageX + touches[1]!.pageX),
      pageY: 0.5 * (touches[0]!.pageY + touches[1]!.pageY),

      dataX: 0.5 * (touches[0]!.dataX! + touches[1]!.dataX!),
      dataY: 0.5 * (touches[0]!.dataY! + touches[1]!.dataY!),
    };

    // Make pinches in a 45-degree swath around either axis 1-dimensional zooms.
    let initialAngle =
      (180 / Math.PI) *
      Math.atan2(
        drag.initialPinchCenter.pageY - touches[0]!.pageY,
        touches[0]!.pageX - drag.initialPinchCenter.pageX,
      );

    // use symmetry to get it into the first quadrant.
    initialAngle = Math.abs(initialAngle);
    if (initialAngle > 90) initialAngle = 90 - initialAngle;

    drag.touchDirections = {
      x: initialAngle < 90 - 45 / 2,
      y: initialAngle > 45 / 2,
    };
  }

  // save the full x & y ranges.
  drag.initialRange = {
    x: chart.xAxisRange(),
    y: chart.yAxisRange() ?? chart.xAxisRange(),
  };
};

/**
 * @private
 */
ZgraphInteraction.moveTouch = function (
  event: TouchEvent,
  g: unknown,
  context: InteractionContext,
) {
  const chart = g as ZgraphInstance;
  const drag = context as DragContext;
  // If the tap moves, then it's definitely not part of a double-tap.
  drag.startTimeForDoubleTapMs = null;

  let i,
    touches: Array<{ pageX: number; pageY: number }> = [];
  for (i = 0; i < event.touches.length; i++) {
    let t = event.touches[i]!;
    touches.push({
      pageX: t.pageX,
      pageY: t.pageY,
    });
  }
  let initialTouches = drag.initialTouches!;

  let c_now: TouchPoint;

  // old and new centers.
  let c_init = drag.initialPinchCenter!;
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
  let dataWidth = drag.initialRange!.x[1] - drag.initialRange!.x[0];
  let dataHeight = drag.initialRange!.y[0] - drag.initialRange!.y[1];
  swipe.dataX = (swipe.pageX / chart.plotter_.area.w) * dataWidth;
  swipe.dataY = (swipe.pageY / chart.plotter_.area.h) * dataHeight;
  let xScale = 1.0,
    yScale = 1.0;

  // The residual bits are usually split into scale & rotate bits, but we split
  // them into x-scale and y-scale bits.
  if (touches.length === 1) {
    xScale = 1.0;
    yScale = 1.0;
  } else if (touches.length >= 2) {
    let initHalfWidth = initialTouches[1]!.pageX - c_init.pageX;
    xScale = (touches[1]!.pageX - c_now.pageX) / initHalfWidth;

    let initHalfHeight = initialTouches[1]!.pageY - c_init.pageY;
    yScale = (touches[1]!.pageY - c_now.pageY) / initHalfHeight;
  }

  // Clip scaling to [1/8, 8] to prevent too much blowup.
  xScale = Math.min(8, Math.max(0.125, xScale));
  yScale = Math.min(8, Math.max(0.125, yScale));

  let didZoom = false;
  if (drag.touchDirections!.x) {
    let cFactor = c_init.dataX! - swipe.dataX / xScale;
    chart.dateWindow_ = [
      cFactor + (drag.initialRange!.x[0] - c_init.dataX!) / xScale,
      cFactor + (drag.initialRange!.x[1] - c_init.dataX!) / xScale,
    ];
    didZoom = true;
  }

  if (drag.touchDirections!.y) {
    for (i = 0; i < 1 /*chart.axes_.length*/; i++) {
      let axis = chart.axes_[i]!;
      let logscale = chart.attributes_.getForAxis('logscale', i);
      if (logscale) {
        // Log-scale y pinch zoom not implemented yet.
      } else {
        let cFactor = c_init.dataY! - swipe.dataY / yScale;
        axis.valueRange = [
          cFactor + (drag.initialRange!.y[0] - c_init.dataY!) / yScale,
          cFactor + (drag.initialRange!.y[1] - c_init.dataY!) / yScale,
        ];
        didZoom = true;
      }
    }
  }

  chart.drawGraph_(false);

  // We only call zoomCallback on zooms, not pans, to mirror desktop behavior.
  if (
    didZoom &&
    touches.length > 1 &&
    chart.getFunctionOption('zoomCallback')
  ) {
    let viewWindow = chart.xAxisRange();
    chart
      .getFunctionOption('zoomCallback')
      .call(chart, viewWindow[0], viewWindow[1], chart.yAxisRanges());
  }
};

/**
 * @private
 */
ZgraphInteraction.endTouch = function (
  event: TouchEvent,
  g: unknown,
  context: InteractionContext,
) {
  const drag = context as DragContext;
  if (event.touches.length !== 0) {
    // this is effectively a "reset"
    ZgraphInteraction.startTouch(event, g, context);
  } else if (event.changedTouches.length === 1) {
    // Could be part of a "double tap"
    // The heuristic here is that it's a double-tap if the two touchend events
    // occur within 500ms and within a 50x50 pixel box.
    let now = new Date().getTime();
    let t = event.changedTouches[0]!;
    if (
      drag.startTimeForDoubleTapMs &&
      now - drag.startTimeForDoubleTapMs < 500 &&
      drag.doubleTapX &&
      Math.abs(drag.doubleTapX - t.screenX) < 50 &&
      drag.doubleTapY &&
      Math.abs(drag.doubleTapY - t.screenY) < 50
    ) {
      (g as ZgraphInstance).resetZoom();
    } else {
      drag.startTimeForDoubleTapMs = now;
      drag.doubleTapX = t.screenX;
      drag.doubleTapY = t.screenY;
    }
  }
};

// Determine the distance from x to [left, right].
let distanceFromInterval = function (x: number, left: number, right: number) {
  if (x < left) {
    return left - x;
  } else if (x > right) {
    return x - right;
  } else {
    return 0;
  }
};

/**
 * Returns the number of pixels by which the event happens from the nearest
 * edge of the chart. For events in the interior of the chart, this returns zero.
 */
let distanceFromChart = function (event: MouseEvent, g: ZgraphInstance) {
  let chartPos = utils.findPos(g.canvas_);
  let box = {
    left: chartPos.x,
    right: chartPos.x + g.canvas_.offsetWidth,
    top: chartPos.y,
    bottom: chartPos.y + g.canvas_.offsetHeight,
  };

  let pt = {
    x: utils.pageX(event),
    y: utils.pageY(event),
  };

  let dx = distanceFromInterval(pt.x, box.left, box.right),
    dy = distanceFromInterval(pt.y, box.top, box.bottom);
  return Math.max(dx, dy);
};

/**
 * Default interation model for zgraph. You can refer to specific elements of
 * this when constructing your own interaction model, e.g.:
 * g.updateOptions( {
 *   interactionModel: {
 *     mousedown: ZgraphInteraction.defaultInteractionModel.mousedown
 *   }
 * } );
 */
ZgraphInteraction.defaultModel = {
  // Track the beginning of drag events
  mousedown: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    const chart = g as ZgraphInstance;
    const drag = context as DragContext;
    // Right-click should not initiate a zoom.
    if (event.button && event.button === 2) return;

    context.initializeMouseDown(event, g, context);

    if (event.altKey || event.shiftKey) {
      ZgraphInteraction.startPan(event, g, context);
    } else {
      ZgraphInteraction.startZoom(event, g, context);
    }

    // Note: we register mousemove/mouseup on document to allow some leeway for
    // events to move outside of the chart. Interaction model events get
    // registered on the canvas, which is too small to allow this.
    // Coalesced: a drag delivers several mousemoves per frame, and each one
    // used to repaint the whole chart. Only the last one in a frame is ever
    // seen. The gesture state itself still updates inside the redraw, so a
    // read of dateWindow lands on the position of the last event handled.
    let mousemove = utils.coalesceFrames(function (moveEvent: MouseEvent) {
      if (drag.isZooming) {
        // When the mouse moves >200px from the chart edge, cancel the zoom.
        let d = distanceFromChart(moveEvent, chart);
        if (d < DRAG_EDGE_MARGIN) {
          ZgraphInteraction.moveZoom(moveEvent, g, context);
        } else {
          if (drag.dragEndX !== null) {
            drag.dragEndX = null;
            drag.dragEndY = null;
            chart.clearZoomRect_();
          }
        }
      } else if (drag.isPanning) {
        ZgraphInteraction.movePan(moveEvent, g, context);
      }
    } as (...args: unknown[]) => void);
    let mouseup = function (upEvent: MouseEvent) {
      // endZoom reads the dragEnd set by moveZoom, so the last move of the
      // gesture has to have run before the gesture ends.
      mousemove.flush();
      if (drag.isZooming) {
        if (drag.dragEndX !== null) {
          ZgraphInteraction.endZoom(upEvent, g, context);
        } else {
          ZgraphInteraction.maybeTreatMouseOpAsClick(upEvent, g, context);
        }
      } else if (drag.isPanning) {
        ZgraphInteraction.endPan(upEvent, g, context);
      }

      utils.removeEvent(document, 'mousemove', mousemove as EventListener);
      utils.removeEvent(document, 'mouseup', mouseup as EventListener);
      (context.destroy as () => void)();
    };

    chart.addAndTrackEvent(document, 'mousemove', mousemove as EventListener);
    chart.addAndTrackEvent(document, 'mouseup', mouseup as EventListener);
  },
  willDestroyContextMyself: true,

  touchstart: function (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    ZgraphInteraction.startTouch(event, g, context);
  },
  touchmove: function (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    ZgraphInteraction.moveTouch(event, g, context);
  },
  touchend: function (
    event: TouchEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    ZgraphInteraction.endTouch(event, g, context);
  },

  // Disable zooming out if panning.
  dblclick: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    const chart = g as ZgraphInstance;
    const drag = context as DragContext;
    if (drag.cancelNextDblclick) {
      drag.cancelNextDblclick = false;
      return;
    }

    // Give plugins a chance to grab this event.
    let e: Record<string, unknown> = {
      canvasx: drag.dragEndX,
      canvasy: drag.dragEndY,
      cancelable: true,
    };
    if (chart.cascadeEvents_('dblclick', e)) {
      return;
    }

    if (event.altKey || event.shiftKey) {
      return;
    }
    chart.resetZoom();
  },
};

/*
Zgraph.DEFAULT_ATTRS.interactionModel = ZgraphInteraction.defaultModel;

// old ways of accessing these methods/properties
Zgraph.defaultInteractionModel = ZgraphInteraction.defaultModel;
Zgraph.endZoom = ZgraphInteraction.endZoom;
Zgraph.moveZoom = ZgraphInteraction.moveZoom;
Zgraph.startZoom = ZgraphInteraction.startZoom;
Zgraph.endPan = ZgraphInteraction.endPan;
Zgraph.movePan = ZgraphInteraction.movePan;
Zgraph.startPan = ZgraphInteraction.startPan;
*/

ZgraphInteraction.nonInteractiveModel_ = {
  mousedown: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    context.initializeMouseDown(event, g, context);
  },
  mouseup: ZgraphInteraction.maybeTreatMouseOpAsClick,
};

// Default interaction model when using the range selector.
ZgraphInteraction.dragIsPanInteractionModel = {
  mousedown: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    context.initializeMouseDown(event, g, context);
    ZgraphInteraction.startPan(event, g, context);
  },
  mousemove: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    if ((context as DragContext).isPanning) {
      ZgraphInteraction.movePan(event, g, context);
    }
  },
  mouseup: function (
    event: MouseEvent,
    g: unknown,
    context: InteractionContext,
  ) {
    if ((context as DragContext).isPanning) {
      ZgraphInteraction.endPan(event, g, context);
    }
  },
};

export default ZgraphInteraction;

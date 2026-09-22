"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false,TouchEvent:false */

/**
 * @fileoverview This file contains the RangeSelector plugin used to provide
 * a timeline range selector widget for zpgraph.
 */

/*global Zpgraph:false */

import * as utils from "../utils";
import { log } from "../logger";
import ZpgraphInteraction from "../interaction-model";
import IFrameTarp from "../iframe-tarp";
import type {
  LayoutPluginEvent,
  PlotArea,
  UnifiedSeries,
  ZpgraphInstance,
} from "../internal-types";
import type { ZpgraphOptions } from "../types";

/** Pointer fields shared by MouseEvent and Touch (range-selector drag). */
type RangePointer = {
  clientX: number;
  target: EventTarget | null;
  type: string;
};

const cancelIfMouse = (e: RangePointer) => {
  if (e instanceof MouseEvent) {
    utils.cancelEvent(e);
  }
};

const touchAsPointer = (touch: Touch, type: string): RangePointer => ({
  clientX: touch.clientX,
  target: touch.target,
  type,
});

const setElementRect = (
  canvas: HTMLCanvasElement | null,
  context: CanvasRenderingContext2D | null,
  rect: PlotArea,
  pixelRatioOption: number,
) => {
  if (!canvas || !context) {
    return;
  }
  const canvasScale = pixelRatioOption || utils.getContextPixelRatio(context);

  canvas.style.top = rect.y + "px";
  canvas.style.left = rect.x + "px";
  canvas.width = rect.w * canvasScale;
  canvas.height = rect.h * canvasScale;
  canvas.style.width = rect.w + "px";
  canvas.style.height = rect.h + "px";

  if (canvasScale !== 1) {
    context.scale(canvasScale, canvasScale);
  }
};

class rangeSelector {
  hasTouchInterface_ = typeof TouchEvent != "undefined";
  isMobileDevice_ = /mobile|android/gi.test(navigator.appVersion);
  interfaceCreated_ = false;

  zpgraph_: ZpgraphInstance | null = null;
  graphDiv_: HTMLElement | null = null;

  // The mini plot: a static background layer and an interactive one above it.
  bgcanvas_: HTMLCanvasElement | null = null;
  bgcanvas_ctx_: CanvasRenderingContext2D | null = null;
  fgcanvas_: HTMLCanvasElement | null = null;
  fgcanvas_ctx_: CanvasRenderingContext2D | null = null;
  canvasRect_: { x: number; y: number; w: number; h: number } | null = null;

  leftZoomHandle_: HTMLImageElement | null = null;
  rightZoomHandle_: HTMLImageElement | null = null;
  isChangingRange_ = false;

  toString() {
    return "RangeSelector Plugin";
  }

  chart_(): ZpgraphInstance {
    return this.zpgraph_!;
  }

  activate(zpgraph: ZpgraphInstance) {
    this.zpgraph_ = zpgraph;
    if (this.getOptionBool_("showRangeSelector")) {
      this.createInterface_();
    }
    return {
      layout: this.reserveSpace_,
      predraw: this.renderStaticLayer_,
      didDrawChart: this.renderInteractiveLayer_,
    };
  }

  destroy() {
    this.bgcanvas_ = null;
    this.fgcanvas_ = null;
    this.leftZoomHandle_ = null;
    this.rightZoomHandle_ = null;
  }

  getOption_(name: string, opt_series?: string): unknown {
    return this.chart_().getOption(name, opt_series);
  }

  getOptionNum_(name: string, opt_series?: string): number {
    return this.chart_().getNumericOption(name, opt_series);
  }

  getOptionStr_(name: string, opt_series?: string): string {
    return this.chart_().getStringOption(name, opt_series);
  }

  getOptionBool_(name: string, opt_series?: string): boolean {
    return this.chart_().getBooleanOption(name, opt_series);
  }

  setDefaultOption_<K extends keyof ZpgraphOptions>(
    name: K,
    value: ZpgraphOptions[K],
  ) {
    this.chart_().attrs_[name] = value;
  }

  createInterface_() {
    this.createCanvases_();
    this.createZoomHandles_();
    this.initInteraction_();

    // Range selector and animatedZooms have a bad interaction. See issue 359.
    if (this.getOptionBool_("animatedZooms")) {
      log.warn(
        "Animated zooms and range selector are not compatible; disabling animatedZooms.",
      );
      this.chart_().updateOptions({ animatedZooms: false }, true);
    }

    this.interfaceCreated_ = true;
    this.addToGraph_();
  }

  addToGraph_() {
    const graphDiv = (this.graphDiv_ = this.chart_().graphDiv);
    graphDiv.appendChild(this.bgcanvas_!);
    graphDiv.appendChild(this.fgcanvas_!);
    graphDiv.appendChild(this.leftZoomHandle_!);
    graphDiv.appendChild(this.rightZoomHandle_!);
  }

  removeFromGraph_() {
    const graphDiv = this.graphDiv_;
    if (!graphDiv) {
      return;
    }
    this.bgcanvas_!.remove();
    this.fgcanvas_!.remove();
    this.leftZoomHandle_!.remove();
    this.rightZoomHandle_!.remove();
    this.graphDiv_ = null;
  }

  reserveSpace_(e: LayoutPluginEvent) {
    if (this.getOptionBool_("showRangeSelector")) {
      e.reserveSpaceBottom(this.getOptionNum_("rangeSelectorHeight") + 4);
    }
  }

  renderStaticLayer_() {
    if (!this.updateVisibility_()) {
      return;
    }
    this.resize_();
    this.drawStaticLayer_();
  }

  renderInteractiveLayer_() {
    if (!this.updateVisibility_() || this.isChangingRange_) {
      return;
    }
    this.placeZoomHandles_();
    this.drawInteractiveLayer_();
  }

  updateVisibility_() {
    const enabled = this.getOptionBool_("showRangeSelector");
    if (enabled) {
      if (!this.interfaceCreated_) {
        this.createInterface_();
      } else if (!this.graphDiv_?.parentNode) {
        this.addToGraph_();
      }
    } else if (this.graphDiv_) {
      this.removeFromGraph_();
      const zpgraph = this.chart_();
      setTimeout(() => {
        zpgraph.width_ = 0;
        zpgraph.resize();
      }, 1);
    }
    return enabled;
  }

  resize_() {
    const plotArea = this.chart_().layout_.getPlotArea();

    let xAxisLabelHeight = 0;
    if (this.chart_().getOptionForAxis("drawAxis", "x")) {
      xAxisLabelHeight =
        this.getOptionNum_("xAxisHeight") ||
        this.getOptionNum_("axisLabelFontSize") +
          2 * this.getOptionNum_("axisTickSize");
    }
    this.canvasRect_ = {
      x: plotArea.x,
      y: plotArea.y + plotArea.h + xAxisLabelHeight + 4,
      w: plotArea.w,
      h: this.getOptionNum_("rangeSelectorHeight"),
    };

    const pixelRatioOption = this.chart_().getNumericOption("pixelRatio");
    setElementRect(
      this.bgcanvas_,
      this.bgcanvas_ctx_,
      this.canvasRect_,
      pixelRatioOption,
    );
    setElementRect(
      this.fgcanvas_,
      this.fgcanvas_ctx_,
      this.canvasRect_,
      pixelRatioOption,
    );
  }

  createCanvases_() {
    this.bgcanvas_ = utils.createCanvas();
    this.bgcanvas_.className = "zpgraph-rangesel-bgcanvas";
    this.bgcanvas_.style.position = "absolute";
    this.bgcanvas_.style.zIndex = "9";
    this.bgcanvas_ctx_ = utils.getContext(this.bgcanvas_);

    this.fgcanvas_ = utils.createCanvas();
    this.fgcanvas_.className = "zpgraph-rangesel-fgcanvas";
    this.fgcanvas_.style.position = "absolute";
    this.fgcanvas_.style.zIndex = "9";
    this.fgcanvas_.style.cursor = "default";
    this.fgcanvas_ctx_ = utils.getContext(this.fgcanvas_);
  }

  createZoomHandles_() {
    const img = new Image();
    img.className = "zpgraph-rangesel-zoomhandle";
    img.style.position = "absolute";
    img.style.zIndex = "10";
    img.style.visibility = "hidden"; // Initially hidden so they don't show up in the wrong place.
    img.style.cursor = "col-resize";
    img.width = 9;
    img.height = 16;
    img.src =
      "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAYAAADESFVDAAAAAXNSR0IArs4c6QAAAAZiS0dEANAA" +
      "zwDP4Z7KegAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAAd0SU1FB9sHGw0cMqdt1UwAAAAZdEVYdENv" +
      "bW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAAaElEQVQoz+3SsRFAQBCF4Z9WJM8KCDVwownl" +
      "6YXsTmCUsyKGkZzcl7zkz3YLkypgAnreFmDEpHkIwVOMfpdi9CEEN2nGpFdwD03yEqDtOgCaun7s" +
      "qSTDH32I1pQA2Pb9sZecAxc5r3IAb21d6878xsAAAAAASUVORK5CYII=";

    if (this.isMobileDevice_) {
      img.width *= 2;
      img.height *= 2;
    }

    this.leftZoomHandle_ = img;
    const right = img.cloneNode(false);
    if (!(right instanceof HTMLImageElement)) {
      return;
    }
    this.rightZoomHandle_ = right;
  }

  initInteraction_() {
    const topElem = document;
    let clientXLast = 0;
    let handle: HTMLImageElement | null = null;
    let isZooming = false;
    let isPanning = false;
    const dynamic = !this.isMobileDevice_;

    // Cover iframes during mouse interactions so cross-origin iframes do not
    // steal mouseup. See IFrameTarp.
    const tarp = new IFrameTarp();

    const toXDataWindow = (zoomHandleStatus: {
      leftHandlePos: number;
      rightHandlePos: number;
    }): [number, number] => {
      const xDataLimits = this.chart_().xAxisExtremes();
      const canvasRect = this.canvasRect_!;
      const fact = (xDataLimits[1] - xDataLimits[0]) / canvasRect.w;
      const xDataMin =
        xDataLimits[0] + (zoomHandleStatus.leftHandlePos - canvasRect.x) * fact;
      const xDataMax =
        xDataLimits[0] +
        (zoomHandleStatus.rightHandlePos - canvasRect.x) * fact;
      return [xDataMin, xDataMax];
    };

    const doZoom = () => {
      try {
        const zoomHandleStatus = this.getZoomHandleStatus_();
        this.isChangingRange_ = true;
        if (!zoomHandleStatus.isZoomed) {
          this.chart_().resetZoom();
        } else {
          const xDataWindow = toXDataWindow(zoomHandleStatus);
          this.chart_().doZoomXDates_(xDataWindow[0], xDataWindow[1]);
        }
      } finally {
        this.isChangingRange_ = false;
      }
    };

    const doPan = () => {
      try {
        this.isChangingRange_ = true;
        this.chart_().dateWindow_ = toXDataWindow(this.getZoomHandleStatus_());
        this.chart_().drawGraph_(false);
      } finally {
        this.isChangingRange_ = false;
      }
    };

    // A drag delivers several moves per frame. The handle itself is moved
    // synchronously below, but the two canvas redraws it implies read the handle
    // position when they run, so only the last move of a frame needs to draw.
    const zoomFrame = utils.coalesceFrames(() => {
      this.drawInteractiveLayer_();
      if (dynamic) {
        doZoom();
      }
    });
    const panFrame = utils.coalesceFrames(() => {
      this.drawInteractiveLayer_();
      if (dynamic) {
        doPan();
      }
    });

    const onZoom = (e: RangePointer) => {
      if (!isZooming || !handle) {
        return false;
      }
      cancelIfMouse(e);

      const delX = e.clientX - clientXLast;
      if (Math.abs(delX) < 4) {
        return true;
      }
      clientXLast = e.clientX;

      // Move handle.
      const zoomHandleStatus = this.getZoomHandleStatus_();
      const canvasRect = this.canvasRect_!;
      let newPos;
      if (handle === this.leftZoomHandle_) {
        newPos = zoomHandleStatus.leftHandlePos + delX;
        newPos = Math.min(
          newPos,
          zoomHandleStatus.rightHandlePos - handle.width - 3,
        );
        newPos = Math.max(newPos, canvasRect.x);
      } else {
        newPos = zoomHandleStatus.rightHandlePos + delX;
        newPos = Math.min(newPos, canvasRect.x + canvasRect.w);
        newPos = Math.max(
          newPos,
          zoomHandleStatus.leftHandlePos + handle.width + 3,
        );
      }
      const halfHandleWidth = handle.width / 2;
      handle.style.left = newPos - halfHandleWidth + "px";
      zoomFrame();
      return true;
    };

    const onZoomMove = (e: Event) => {
      if (e instanceof MouseEvent) {
        onZoom(e);
      }
    };

    const onZoomEnd = (_e: Event) => {
      if (!isZooming) {
        return false;
      }
      isZooming = false;
      tarp.uncover();
      utils.removeEvent(topElem, "mousemove", onZoomMove);
      utils.removeEvent(topElem, "mouseup", onZoomEnd);
      this.fgcanvas_!.style.cursor = "default";

      // The gesture ends where the last move left the handle.
      zoomFrame.flush();
      // If on a slower device, zoom now.
      if (!dynamic) {
        doZoom();
      }
      return true;
    };

    const onZoomStart = (e: RangePointer) => {
      cancelIfMouse(e);
      isZooming = true;
      clientXLast = e.clientX;
      handle =
        e.target instanceof HTMLImageElement ? e.target : this.leftZoomHandle_;
      if (e.type === "mousedown" || e.type === "dragstart") {
        // These events are removed manually.
        utils.addEvent(topElem, "mousemove", onZoomMove);
        utils.addEvent(topElem, "mouseup", onZoomEnd);
      }
      this.fgcanvas_!.style.cursor = "col-resize";
      tarp.cover();
      return true;
    };

    const isMouseInPanZone = (e: RangePointer) => {
      let rect = this.leftZoomHandle_!.getBoundingClientRect();
      const leftHandleClientX = rect.left + rect.width / 2;
      rect = this.rightZoomHandle_!.getBoundingClientRect();
      const rightHandleClientX = rect.left + rect.width / 2;
      return e.clientX > leftHandleClientX && e.clientX < rightHandleClientX;
    };

    const onPan = (e: RangePointer) => {
      if (!isPanning) {
        return false;
      }
      cancelIfMouse(e);

      const delX = e.clientX - clientXLast;
      if (Math.abs(delX) < 4) {
        return true;
      }
      clientXLast = e.clientX;

      // Move range view
      const zoomHandleStatus = this.getZoomHandleStatus_();
      const canvasRect = this.canvasRect_!;
      let leftHandlePos = zoomHandleStatus.leftHandlePos;
      let rightHandlePos = zoomHandleStatus.rightHandlePos;
      const rangeSize = rightHandlePos - leftHandlePos;
      if (leftHandlePos + delX <= canvasRect.x) {
        leftHandlePos = canvasRect.x;
        rightHandlePos = leftHandlePos + rangeSize;
      } else if (rightHandlePos + delX >= canvasRect.x + canvasRect.w) {
        rightHandlePos = canvasRect.x + canvasRect.w;
        leftHandlePos = rightHandlePos - rangeSize;
      } else {
        leftHandlePos += delX;
        rightHandlePos += delX;
      }
      const halfHandleWidth = this.leftZoomHandle_!.width / 2;
      this.leftZoomHandle_!.style.left = leftHandlePos - halfHandleWidth + "px";
      this.rightZoomHandle_!.style.left =
        rightHandlePos - halfHandleWidth + "px";
      panFrame();
      return true;
    };

    const onPanMove = (e: Event) => {
      if (e instanceof MouseEvent) {
        onPan(e);
      }
    };

    const onPanEnd = (_e: Event) => {
      if (!isPanning) {
        return false;
      }
      isPanning = false;
      utils.removeEvent(topElem, "mousemove", onPanMove);
      utils.removeEvent(topElem, "mouseup", onPanEnd);
      tarp.uncover();
      // The gesture ends where the last move left the handles.
      panFrame.flush();
      // If on a slower device, do pan now.
      if (!dynamic) {
        doPan();
      }
      return true;
    };

    const onPanStart = (e: RangePointer) => {
      if (
        !isPanning &&
        isMouseInPanZone(e) &&
        this.getZoomHandleStatus_().isZoomed
      ) {
        cancelIfMouse(e);
        isPanning = true;
        clientXLast = e.clientX;
        if (e.type === "mousedown") {
          // These events are removed manually.
          utils.addEvent(topElem, "mousemove", onPanMove);
          utils.addEvent(topElem, "mouseup", onPanEnd);
        }
        tarp.cover();
        return true;
      }
      return false;
    };

    const onCanvasHover = (e: Event) => {
      if (!(e instanceof MouseEvent) || isZooming || isPanning) {
        return;
      }
      const cursor = isMouseInPanZone(e) ? "move" : "default";
      if (cursor !== this.fgcanvas_!.style.cursor) {
        this.fgcanvas_!.style.cursor = cursor;
      }
    };

    const onZoomHandleTouchEvent = (e: Event) => {
      if (!(e instanceof TouchEvent)) {
        return;
      }
      const touch = e;
      if (touch.type === "touchstart" && touch.targetTouches.length === 1) {
        const t = touch.targetTouches[0];
        if (t && onZoomStart(touchAsPointer(t, touch.type))) {
          utils.cancelEvent(touch);
        }
      } else if (
        touch.type === "touchmove" &&
        touch.targetTouches.length === 1
      ) {
        const t = touch.targetTouches[0];
        if (t && onZoom(touchAsPointer(t, touch.type))) {
          utils.cancelEvent(touch);
        }
      } else {
        onZoomEnd(touch);
      }
    };

    const onCanvasTouchEvent = (e: Event) => {
      if (!(e instanceof TouchEvent)) {
        return;
      }
      const touch = e;
      if (touch.type === "touchstart" && touch.targetTouches.length === 1) {
        const t = touch.targetTouches[0];
        if (t && onPanStart(touchAsPointer(t, touch.type))) {
          utils.cancelEvent(touch);
        }
      } else if (
        touch.type === "touchmove" &&
        touch.targetTouches.length === 1
      ) {
        const t = touch.targetTouches[0];
        if (t && onPan(touchAsPointer(t, touch.type))) {
          utils.cancelEvent(touch);
        }
      } else {
        onPanEnd(touch);
      }
    };

    const addTouchEvents = (elem: HTMLElement, fn: (e: Event) => void) => {
      const types = ["touchstart", "touchend", "touchmove", "touchcancel"];
      for (let i = 0; i < types.length; i++) {
        this.chart_().addAndTrackEvent(elem, types[i]!, fn);
      }
    };

    this.setDefaultOption_(
      "interactionModel",
      ZpgraphInteraction.dragIsPanInteractionModel,
    );
    this.setDefaultOption_("panEdgeFraction", 0.0001);

    const dragStartEvent = "opera" in window ? "mousedown" : "dragstart";
    const onZoomStartMouse = (e: Event) => {
      if (e instanceof MouseEvent) {
        onZoomStart(e);
      }
    };
    const onPanStartMouse = (e: Event) => {
      if (e instanceof MouseEvent) {
        onPanStart(e);
      }
    };
    this.chart_().addAndTrackEvent(
      this.leftZoomHandle_!,
      dragStartEvent,
      onZoomStartMouse,
    );
    this.chart_().addAndTrackEvent(
      this.rightZoomHandle_!,
      dragStartEvent,
      onZoomStartMouse,
    );

    this.chart_().addAndTrackEvent(
      this.fgcanvas_!,
      "mousedown",
      onPanStartMouse,
    );
    this.chart_().addAndTrackEvent(
      this.fgcanvas_!,
      "mousemove",
      onCanvasHover,
    );

    // Touch events
    if (this.hasTouchInterface_) {
      addTouchEvents(this.leftZoomHandle_!, onZoomHandleTouchEvent);
      addTouchEvents(this.rightZoomHandle_!, onZoomHandleTouchEvent);
      addTouchEvents(this.fgcanvas_!, onCanvasTouchEvent);
    }
  }

  drawStaticLayer_() {
    const ctx = this.bgcanvas_ctx_!;
    const canvasRect = this.canvasRect_!;
    ctx.clearRect(0, 0, canvasRect.w, canvasRect.h);
    try {
      this.drawMiniPlot_();
    } catch (ex) {
      log.warn(ex);
    }

    const margin = 0.5;
    ctx.lineWidth = this.getOptionNum_("rangeSelectorBackgroundLineWidth");
    ctx.strokeStyle = this.getOptionStr_("rangeSelectorBackgroundStrokeColor");
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, canvasRect.h - margin);
    ctx.lineTo(canvasRect.w - margin, canvasRect.h - margin);
    ctx.lineTo(canvasRect.w - margin, margin);
    ctx.stroke();
  }

  drawMiniPlot_() {
    const fillStyle = this.getOptionStr_("rangeSelectorPlotFillColor");
    const fillGradientStyle = this.getOptionStr_(
      "rangeSelectorPlotFillGradientColor",
    );
    const strokeStyle = this.getOptionStr_("rangeSelectorPlotStrokeColor");
    if (!fillStyle && !strokeStyle) {
      return;
    }

    const stepPlot = this.getOptionBool_("stepPlot");

    const combinedSeriesData = this.computeCombinedSeriesAndLimits_();
    const yRange = combinedSeriesData.yMax - combinedSeriesData.yMin;

    // Draw the mini plot.
    const ctx = this.bgcanvas_ctx_!;
    const canvasRect = this.canvasRect_!;
    const margin = 0.5;

    const xExtremes = this.chart_().xAxisExtremes();
    const xRange = Math.max(xExtremes[1] - xExtremes[0], 1e-30);
    const xFact = (canvasRect.w - margin) / xRange;
    const yFact = (canvasRect.h - margin) / yRange;
    const canvasWidth = canvasRect.w - margin;
    const canvasHeight = canvasRect.h - margin;

    let prevX: number | null = null;
    let prevY: number | null = null;

    ctx.beginPath();
    ctx.moveTo(margin, canvasHeight);
    for (let i = 0; i < combinedSeriesData.data.length; i++) {
      const dataPoint = combinedSeriesData.data[i]!;
      const x =
        dataPoint[0] !== null ? (dataPoint[0] - xExtremes[0]) * xFact : NaN;
      const y =
        dataPoint[1] !== null
          ? canvasHeight - (dataPoint[1] - combinedSeriesData.yMin) * yFact
          : NaN;

      // Skip points that don't change the x-value. Overly fine-grained points
      // can cause major slowdowns with the ctx.fill() call below.
      if (!stepPlot && prevX !== null && Math.round(x) === Math.round(prevX)) {
        continue;
      }

      if (isFinite(x) && isFinite(y)) {
        if (prevX === null) {
          ctx.lineTo(x, canvasHeight);
        } else if (stepPlot && prevY !== null) {
          ctx.lineTo(x, prevY);
        }
        ctx.lineTo(x, y);
        prevX = x;
        prevY = y;
      } else {
        if (prevX !== null) {
          if (stepPlot && prevY !== null) {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, canvasHeight);
          } else {
            ctx.lineTo(prevX, canvasHeight);
          }
        }
        prevX = prevY = null;
      }
    }
    ctx.lineTo(canvasWidth, canvasHeight);
    ctx.closePath();

    if (fillStyle) {
      const lingrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      if (fillGradientStyle) {
        lingrad.addColorStop(0, fillGradientStyle);
      }
      lingrad.addColorStop(1, fillStyle);
      ctx.fillStyle = lingrad;
      ctx.fill();
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = this.getOptionNum_("rangeSelectorPlotLineWidth");
      ctx.stroke();
    }
  }

  computeCombinedSeriesAndLimits_() {
    const g = this.chart_();
    const logscale = this.getOptionBool_("logscale");
    let i;

    // Select series to combine. By default, all series are combined.
    const numColumns = g.numColumns();
    const labels = g.getLabels();
    const includeSeries: Array<boolean | null | undefined> = Array.from(
      { length: numColumns },
      () => undefined,
    );
    let anySet = false;
    const visibility = g.visibility();
    const inclusion: Array<boolean | null> = [];

    for (i = 1; i < numColumns; i++) {
      const raw = this.getOption_("showInRangeSelector", labels![i]);
      const include =
        typeof raw === "boolean" || raw === null ? raw : null;
      inclusion.push(include);
      if (include !== null) {
        anySet = true;
      } // it's set explicitly for this series
    }

    if (anySet) {
      for (i = 1; i < numColumns; i++) {
        includeSeries[i] = inclusion[i - 1];
      }
    } else {
      for (i = 1; i < numColumns; i++) {
        includeSeries[i] = visibility[i - 1];
      }
    }

    // Create a combined series (average of selected series values).
    const rolledSeries: UnifiedSeries[] = [];
    const dataHandler = g.dataHandler_;
    const options = g.attributes_;
    for (i = 1; i < g.numColumns(); i++) {
      if (!includeSeries[i]) {
        continue;
      }
      let series = dataHandler.extractSeries(g.rawData_!, i, options);
      if (g.rollPeriod() > 1) {
        series = dataHandler.rollingAverage(series, g.rollPeriod(), options, i);
      }

      rolledSeries.push(series);
    }

    const combinedSeries: UnifiedSeries = [];
    const baseSeries = rolledSeries[0];
    if (!baseSeries) {
      return { data: combinedSeries, yMin: 0, yMax: 1 };
    }
    for (i = 0; i < baseSeries.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < rolledSeries.length; j++) {
        const y = rolledSeries[j]![i]![1];
        if (y === null || isNaN(y)) {
          continue;
        }
        count++;
        sum += y;
      }
      combinedSeries.push([baseSeries[i]![0], sum / count]);
    }

    // Compute the y range.
    let yMin = Number.MAX_VALUE;
    let yMax = -Number.MAX_VALUE;
    for (i = 0; i < combinedSeries.length; i++) {
      const yVal = combinedSeries[i]![1];
      if (yVal !== null && isFinite(yVal) && (!logscale || yVal > 0)) {
        yMin = Math.min(yMin, yVal);
        yMax = Math.max(yMax, yVal);
      }
    }

    // Convert Y data to log scale if needed.
    // Also, expand the Y range to compress the mini plot a little.
    const extraPercent = 0.25;
    if (logscale) {
      yMax = utils.log10(yMax);
      yMax += yMax * extraPercent;
      yMin = utils.log10(yMin);
      for (i = 0; i < combinedSeries.length; i++) {
        const yv = combinedSeries[i]![1];
        if (yv !== null) {
          combinedSeries[i]![1] = utils.log10(yv);
        }
      }
    } else {
      let yExtra;
      const yRange = yMax - yMin;
      if (yRange <= Number.MIN_VALUE) {
        yExtra = yMax * extraPercent;
      } else {
        yExtra = yRange * extraPercent;
      }
      yMax += yExtra;
      yMin -= yExtra;
    }

    return { data: combinedSeries, yMin: yMin, yMax: yMax };
  }

  placeZoomHandles_() {
    const canvasRect = this.canvasRect_!;
    const leftHandle = this.leftZoomHandle_!;
    const rightHandle = this.rightZoomHandle_!;
    const xExtremes = this.chart_().xAxisExtremes();
    const xWindowLimits = this.chart_().xAxisRange();
    const xRange = xExtremes[1] - xExtremes[0];
    const leftPercent = Math.max(0, (xWindowLimits[0] - xExtremes[0]) / xRange);
    const rightPercent = Math.max(
      0,
      (xExtremes[1] - xWindowLimits[1]) / xRange,
    );
    const leftCoord = canvasRect.x + canvasRect.w * leftPercent;
    const rightCoord = canvasRect.x + canvasRect.w * (1 - rightPercent);
    const handleTop = Math.max(
      canvasRect.y,
      canvasRect.y + (canvasRect.h - leftHandle.height) / 2,
    );
    const halfHandleWidth = leftHandle.width / 2;
    leftHandle.style.left = leftCoord - halfHandleWidth + "px";
    leftHandle.style.top = handleTop + "px";
    rightHandle.style.left = rightCoord - halfHandleWidth + "px";
    rightHandle.style.top = leftHandle.style.top;

    leftHandle.style.visibility = "visible";
    rightHandle.style.visibility = "visible";
  }

  drawInteractiveLayer_() {
    const ctx = this.fgcanvas_ctx_!;
    const canvasRect = this.canvasRect_!;
    ctx.clearRect(0, 0, canvasRect.w, canvasRect.h);
    const margin = 1;
    const width = canvasRect.w - margin;
    const height = canvasRect.h - margin;
    const zoomHandleStatus = this.getZoomHandleStatus_();

    ctx.strokeStyle = this.getOptionStr_("rangeSelectorForegroundStrokeColor");
    ctx.lineWidth = this.getOptionNum_("rangeSelectorForegroundLineWidth");
    if (!zoomHandleStatus.isZoomed) {
      ctx.beginPath();
      ctx.moveTo(margin, margin);
      ctx.lineTo(margin, height);
      ctx.lineTo(width, height);
      ctx.lineTo(width, margin);
      ctx.stroke();
    } else {
      const leftHandleCanvasPos = Math.max(
        margin,
        zoomHandleStatus.leftHandlePos - canvasRect.x,
      );
      const rightHandleCanvasPos = Math.min(
        width,
        zoomHandleStatus.rightHandlePos - canvasRect.x,
      );

      const veilColour = this.getOptionStr_("rangeSelectorVeilColour");
      ctx.fillStyle = veilColour
        ? veilColour
        : "rgba(240, 240, 240, " +
          this.getOptionNum_("rangeSelectorAlpha").toString() +
          ")";
      ctx.fillRect(0, 0, leftHandleCanvasPos, canvasRect.h);
      ctx.fillRect(
        rightHandleCanvasPos,
        0,
        canvasRect.w - rightHandleCanvasPos,
        canvasRect.h,
      );

      ctx.beginPath();
      ctx.moveTo(margin, margin);
      ctx.lineTo(leftHandleCanvasPos, margin);
      ctx.lineTo(leftHandleCanvasPos, height);
      ctx.lineTo(rightHandleCanvasPos, height);
      ctx.lineTo(rightHandleCanvasPos, margin);
      ctx.lineTo(width, margin);
      ctx.stroke();
    }
  }

  getZoomHandleStatus_() {
    const canvasRect = this.canvasRect_!;
    const leftHandle = this.leftZoomHandle_!;
    const rightHandle = this.rightZoomHandle_!;
    const halfHandleWidth = leftHandle.width / 2;
    const leftHandlePos = parseFloat(leftHandle.style.left) + halfHandleWidth;
    const rightHandlePos = parseFloat(rightHandle.style.left) + halfHandleWidth;
    return {
      leftHandlePos: leftHandlePos,
      rightHandlePos: rightHandlePos,
      isZoomed:
        leftHandlePos - 1 > canvasRect.x ||
        rightHandlePos + 1 < canvasRect.x + canvasRect.w,
    };
  }
}

//------------------------------------------------------------------
// Private methods
//------------------------------------------------------------------

/**
 * @private
 * Creates the range selector elements and adds them to the graph.
 */

/**
 * @private
 * Adds the range selector to the graph.
 */

/**
 * @private
 * Removes the range selector from the graph.
 */

/**
 * @private
 * Called by Layout to allow range selector to reserve its space.
 */

/**
 * @private
 * Renders the static portion of the range selector at the predraw stage.
 */

/**
 * @private
 * Renders the interactive portion of the range selector after the chart has been drawn.
 */

/**
 * @private
 * Check to see if the range selector is enabled/disabled and update visibility accordingly.
 */

/**
 * @private
 * Resizes the range selector.
 */

/**
 * @private
 * Creates the background and foreground canvases.
 */

/**
 * @private
 * Creates the zoom handle elements.
 */

/**
 * @private
 * Sets up the interaction for the range selector.
 */

/**
 * @private
 * Draws the static layer in the background canvas.
 */

/**
 * @private
 * Draws the mini plot in the background canvas.
 */

/**
 * @private
 * Computes and returns the combined series data along with min/max for the mini plot.
 * The combined series consists of averaged values for all series.
 * When series have error bars, the error bars are ignored.
 * @return An object containing combined series array, ymin, ymax.
 */

/**
 * @private
 * Places the zoom handles in the proper position based on the current X data window.
 */

/**
 * @private
 * Draws the interactive layer in the foreground canvas.
 */

/**
 * @private
 * Returns the current zoom handle position information.
 * @return The zoom handle status.
 */

export default rangeSelector;

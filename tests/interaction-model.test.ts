import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import ZpgraphInteraction from "../src/interaction-model";
import type { InteractionContext } from "../src/types";
import { mockCanvas, mountDiv } from "./helpers";

/**
 * Pan, zoom and touch run on every frame of a drag, so they are the code
 * Wave 4 rewrites. These tests pin the observable result of each gesture —
 * where the x and y ranges end up — so the rewrite has something to answer to.
 */

// 40 rows, x from 0 to 39, so a pixel-to-data conversion is easy to reason about.
const data = Array.from({ length: 40 }, (_, i) => [i, i, 40 - i]);

const makeChart = (opts: Record<string, unknown> = {}) =>
  new Zpgraph(mountDiv(), data, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    ...opts,
  }) as unknown as Record<string, any>;

/** The interaction functions only ever read pageX/pageY off the event. */
const dragEvent = (pageX: number, pageY: number): MouseEvent =>
  ({
    pageX,
    pageY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as MouseEvent;

// The interaction functions treat the context as a scratchpad and add keys to
// it as a gesture progresses, so this is deliberately open.
const newContext = (startX = 0, startY = 0): InteractionContext =>
  ({
    px: 0,
    py: 0,
    dragStartX: startX,
    dragStartY: startY,
    dragEndX: startX,
    dragEndY: startY,
    isZooming: false,
    isPanning: false,
    is2DPan: false,
    cancelNextDblclick: false,
    initializeMouseDown: vi.fn(),
  }) as InteractionContext;

describe("pan", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("dragging right moves the window to earlier x values", () => {
    const g = makeChart({ dateWindow: [10, 20] });
    const context = newContext(200, 100);

    ZpgraphInteraction.startPan(dragEvent(200, 100), g, context);
    expect(context.isPanning).toBe(true);

    const before = g.xAxisRange();
    ZpgraphInteraction.movePan(dragEvent(260, 100), g, context);
    const after = g.xAxisRange();

    expect(after[0]!).toBeLessThan(before[0]!);
    // Panning slides the window; it never resizes it.
    expect(after[1] - after[0]!).toBeCloseTo(before[1] - before[0]!, 6);

    g.destroy();
  });

  it("dragging left moves the window to later x values", () => {
    const g = makeChart({ dateWindow: [10, 20] });
    const context = newContext(200, 100);

    ZpgraphInteraction.startPan(dragEvent(200, 100), g, context);
    ZpgraphInteraction.movePan(dragEvent(140, 100), g, context);

    expect(g.xAxisRange()[0]!).toBeGreaterThan(10);
    g.destroy();
  });

  it("stays one-dimensional until an axis has an explicit valueRange", () => {
    const free = makeChart();
    const freeContext = newContext(200, 100);
    ZpgraphInteraction.startPan(dragEvent(200, 100), free, freeContext);
    expect(freeContext.is2DPan).toBe(false);
    free.destroy();

    const pinned = makeChart({ valueRange: [0, 50] });
    const pinnedContext = newContext(200, 100);
    ZpgraphInteraction.startPan(dragEvent(200, 100), pinned, pinnedContext);
    expect(pinnedContext.is2DPan).toBe(true);

    const beforeY = pinned.yAxisRange(0);
    ZpgraphInteraction.movePan(dragEvent(200, 160), pinned, pinnedContext);
    const afterY = pinned.yAxisRange(0);
    expect(afterY[0]!).not.toBeCloseTo(beforeY[0]!, 6);
    expect(afterY[1] - afterY[0]!).toBeCloseTo(beforeY[1] - beforeY[0]!, 6);

    pinned.destroy();
  });

  it("panEdgeFraction stops the window from leaving the data behind", () => {
    const g = makeChart({ dateWindow: [10, 20], panEdgeFraction: 0.1 });
    const context = newContext(200, 100);

    ZpgraphInteraction.startPan(dragEvent(200, 100), g, context);
    expect(context.boundedDates).not.toBeNull();

    // Drag far past the left edge of the data.
    ZpgraphInteraction.movePan(dragEvent(5000, 100), g, context);
    expect(g.xAxisRange()[0]!).toBeGreaterThanOrEqual(
      (context.boundedDates as [number, number])[0]!,
    );

    g.destroy();
  });
});

describe("zoom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("a horizontal drag narrows the x range to the dragged span", () => {
    const g = makeChart();
    const context = newContext(150, 100);
    const full = g.xAxisRange();

    ZpgraphInteraction.startZoom(dragEvent(150, 100), g, context);
    expect(context.isZooming).toBe(true);

    ZpgraphInteraction.moveZoom(dragEvent(300, 100), g, context);
    expect(context.zoomMoved).toBe(true);

    context.dragDirection = 1; // HORIZONTAL
    ZpgraphInteraction.endZoom(dragEvent(300, 100), g, context);

    const zoomed = g.xAxisRange();
    expect(zoomed[1] - zoomed[0]!).toBeLessThan(full[1] - full[0]!);
    expect(context.isZooming).toBe(false);

    g.destroy();
  });

  it("resetZoom returns to the full range", () => {
    const g = makeChart();
    const full = g.xAxisRange();

    const context = newContext(150, 100);
    ZpgraphInteraction.startZoom(dragEvent(150, 100), g, context);
    ZpgraphInteraction.moveZoom(dragEvent(300, 100), g, context);
    context.dragDirection = 1;
    ZpgraphInteraction.endZoom(dragEvent(300, 100), g, context);
    expect(g.xAxisRange()[1] - g.xAxisRange()[0]!).toBeLessThan(
      full[1] - full[0]!,
    );

    g.resetZoom();
    expect(g.xAxisRange()[0]!).toBeCloseTo(full[0]!, 6);
    expect(g.xAxisRange()[1]!).toBeCloseTo(full[1]!, 6);

    g.destroy();
  });

  it("a drag shorter than 2px is treated as a click, not a zoom", () => {
    const clickCallback = vi.fn();
    const g = makeChart({ clickCallback });
    const full = g.xAxisRange();

    // A click is only dispatched when a point is under the cursor, which is
    // what a preceding mousemove (or setSelection) establishes.
    g.setSelection(5);
    const context = newContext(150, 100);
    ZpgraphInteraction.maybeTreatMouseOpAsClick(
      dragEvent(151, 100),
      g,
      context,
    );

    expect(clickCallback).toHaveBeenCalled();
    expect(g.xAxisRange()[1] - g.xAxisRange()[0]!).toBeCloseTo(
      full[1] - full[0]!,
      6,
    );

    g.destroy();
  });
});

describe("touch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  const touchEvent = (
    points: Array<{ x: number; y: number }>,
    target: Element,
  ): TouchEvent =>
    ({
      preventDefault: vi.fn(),
      touches: points.map((p) => ({
        pageX: p.x,
        pageY: p.y,
        clientX: p.x,
        clientY: p.y,
        target,
      })),
    }) as unknown as TouchEvent;

  it("a one-finger swipe pans without rescaling", () => {
    const g = makeChart({ dateWindow: [10, 20] });
    const target = g.graphDiv.querySelector("canvas")!;
    const context = newContext();

    const before = g.xAxisRange();
    ZpgraphInteraction.startTouch(
      touchEvent([{ x: 200, y: 100 }], target),
      g,
      context,
    );
    expect(context.touchDirections).toEqual({ x: true, y: true });

    ZpgraphInteraction.moveTouch(
      touchEvent([{ x: 260, y: 100 }], target),
      g,
      context,
    );
    const after = g.xAxisRange();

    expect(after[0]!).not.toBeCloseTo(before[0]!, 6);
    expect(after[1] - after[0]!).toBeCloseTo(before[1] - before[0]!, 4);

    g.destroy();
  });

  it("a horizontal pinch zooms the x axis only", () => {
    const g = makeChart({ dateWindow: [10, 20] });
    const target = g.graphDiv.querySelector("canvas")!;
    const context = newContext();

    const beforeX = g.xAxisRange();

    // Two fingers side by side: a horizontal pinch.
    ZpgraphInteraction.startTouch(
      touchEvent(
        [
          { x: 180, y: 100 },
          { x: 280, y: 100 },
        ],
        target,
      ),
      g,
      context,
    );
    expect((context.touchDirections as { x: boolean; y: boolean }).x).toBe(
      true,
    );
    expect((context.touchDirections as { x: boolean; y: boolean }).y).toBe(
      false,
    );

    // Spread them apart: zoom in.
    ZpgraphInteraction.moveTouch(
      touchEvent(
        [
          { x: 130, y: 100 },
          { x: 330, y: 100 },
        ],
        target,
      ),
      g,
      context,
    );

    const afterX = g.xAxisRange();
    expect(afterX[1] - afterX[0]!).toBeLessThan(beforeX[1] - beforeX[0]!);
    // The y axis is left to auto-scale: a horizontal pinch must not pin it.
    expect(g.axes_[0]!.valueRange).toBeFalsy();

    ZpgraphInteraction.endTouch(
      {
        preventDefault: vi.fn(),
        touches: [],
        changedTouches: [],
      } as unknown as TouchEvent,
      g,
      context,
    );
    g.destroy();
  });

  it("a second tap within 500ms resets the zoom, a second finger cancels it", () => {
    const g = makeChart({ dateWindow: [10, 20] });
    const target = g.graphDiv.querySelector("canvas")!;
    const context = newContext();
    const tapEnd = {
      preventDefault: vi.fn(),
      touches: [],
      changedTouches: [{ screenX: 200, screenY: 100 }],
    } as unknown as TouchEvent;

    // First tap only arms the double-tap window.
    ZpgraphInteraction.startTouch(
      touchEvent([{ x: 200, y: 100 }], target),
      g,
      context,
    );
    ZpgraphInteraction.endTouch(tapEnd, g, context);
    expect(context.startTimeForDoubleTapMs).toEqual(expect.any(Number));
    expect(g.xAxisRange()[0]!).toBeCloseTo(10, 6);

    // A second finger means the gesture is a pinch, not a double tap.
    ZpgraphInteraction.startTouch(
      touchEvent(
        [
          { x: 180, y: 100 },
          { x: 280, y: 100 },
        ],
        target,
      ),
      g,
      context,
    );
    expect(context.startTimeForDoubleTapMs).toBeNull();

    // Arm it again and complete the double tap: the zoom resets.
    ZpgraphInteraction.startTouch(
      touchEvent([{ x: 200, y: 100 }], target),
      g,
      context,
    );
    ZpgraphInteraction.endTouch(tapEnd, g, context);
    ZpgraphInteraction.startTouch(
      touchEvent([{ x: 200, y: 100 }], target),
      g,
      context,
    );
    ZpgraphInteraction.endTouch(tapEnd, g, context);
    expect(g.xAxisRange()[0]!).toBeLessThan(10);

    g.destroy();
  });
});

describe("interaction models", () => {
  it("the default model handles the gestures the chart binds", () => {
    // mousemove and mouseup are registered on document by mousedown itself,
    // so they are not keys of the model.
    for (const name of [
      "mousedown",
      "dblclick",
      "touchstart",
      "touchmove",
      "touchend",
    ]) {
      expect(typeof ZpgraphInteraction.defaultModel[name]).toBe("function");
    }
  });

  it("dragIsPanInteractionModel pans instead of zooming", () => {
    document.body.innerHTML = "";
    mockCanvas();
    const g = makeChart({
      dateWindow: [10, 20],
      interactionModel: ZpgraphInteraction.dragIsPanInteractionModel,
    });
    const context = newContext(200, 100);
    const before = g.xAxisRange();

    (
      ZpgraphInteraction.dragIsPanInteractionModel.mousemove as (
        e: MouseEvent,
        g: unknown,
        context: unknown,
      ) => void
    )(dragEvent(260, 100), g, context);
    // Not panning yet: mousemove before mousedown must be a no-op.
    expect(g.xAxisRange()[0]!).toBeCloseTo(before[0]!, 6);

    ZpgraphInteraction.startPan(dragEvent(200, 100), g, context);
    (
      ZpgraphInteraction.dragIsPanInteractionModel.mousemove as (
        e: MouseEvent,
        g: unknown,
        context: unknown,
      ) => void
    )(dragEvent(260, 100), g, context);
    expect(g.xAxisRange()[0]!).toBeLessThan(before[0]!);

    g.destroy();
  });

  it("the non-interactive model answers no gesture", () => {
    expect(Object.keys(ZpgraphInteraction.nonInteractiveModel_)).toEqual(
      expect.arrayContaining(["mousedown", "mouseup"]),
    );
  });

  it("a custom interactionModel replaces the default handlers", () => {
    document.body.innerHTML = "";
    mockCanvas();
    const mousedown = vi.fn();
    const g = makeChart({ interactionModel: { mousedown } });

    g.mouseEventElement_.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    expect(mousedown).toHaveBeenCalled();

    g.destroy();
  });
});

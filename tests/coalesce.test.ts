import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import ZpgraphInteraction from "../src/interaction-model";
import type { InteractionContext } from "../src/types";
import { coalesceFrames } from "../src/utils";
import { callProp, mockCanvas, mountDiv } from "./helpers";

/**
 * A drag delivers several events per frame and each one used to repaint the
 * whole chart, so all but the last repaint of a frame was thrown away unseen.
 * What matters is that the work collapses *and* that the gesture still ends
 * where the last event put it.
 */

/** Manual control of the frame clock, so nothing here depends on timing. */
let frames = new Map<number, FrameRequestCallback>();
let nextHandle = 1;

const runFrame = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const f of due) {
    f(0);
  }
};

const mouseEvent = (type: string, pageX: number): MouseEvent => {
  const e = new MouseEvent(type, { bubbles: true });
  // jsdom leaves pageX at 0; the interaction code reads only this.
  Object.defineProperty(e, "pageX", { value: pageX });
  Object.defineProperty(e, "pageY", { value: 100 });
  return e;
};

beforeEach(() => {
  frames = new Map();
  nextHandle = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const handle = nextHandle++;
    frames.set(handle, cb);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (h: number) => frames.delete(h));
  document.body.innerHTML = "";
  mockCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coalesceFrames", () => {
  it("runs once per frame, with the arguments of the last call", () => {
    const fn = vi.fn();
    const coalesced = coalesceFrames(fn);

    coalesced(1);
    coalesced(2);
    coalesced(3);
    expect(fn).not.toHaveBeenCalled();

    runFrame();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it("flush runs the pending call immediately and only once", () => {
    const fn = vi.fn();
    const coalesced = coalesceFrames(fn);

    coalesced("a");
    coalesced.flush();
    expect(fn).toHaveBeenCalledWith("a");

    // The frame that was queued must not fire a second time.
    runFrame();
    coalesced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const coalesced = coalesceFrames(fn);

    coalesced("a");
    coalesced.cancel();
    runFrame();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("a mouse drag", () => {
  const data = Array.from({ length: 40 }, (_, i) => [i, i]);

  const makeChart = () =>
    new Zpgraph(mountDiv(), data, {
      labels: ["x", "A"],
      width: 480,
      height: 320,
      dateWindow: [10, 20],
    });

  it("repaints once per frame and ends at the last event", () => {
    const g = makeChart();
    runFrame(); // let any frame from construction settle

    // The same scratchpad the chart builds for a gesture, minus the DOM tarp.
    const context: InteractionContext = {
      px: 0,
      py: 0,
      isZooming: false,
      isPanning: false,
      is2DPan: false,
      cancelNextDblclick: false,
      initializeMouseDown: (event, _g, ctx) => {
        const pageX = Reflect.get(event, "pageX");
        const pageY = Reflect.get(event, "pageY");
        ctx.dragStartX = typeof pageX === "number" ? pageX : 0;
        ctx.dragStartY = typeof pageY === "number" ? pageY : 0;
        ctx.dragEndX = ctx.dragStartX;
        ctx.dragEndY = ctx.dragStartY;
      },
      destroy: () => {},
      tarp: { cover: () => {}, uncover: () => {} },
    };

    const down = mouseEvent("mousedown", 200);
    Object.defineProperty(down, "shiftKey", { value: true }); // shift drag = pan
    callProp(ZpgraphInteraction.defaultModel, "mousedown", [down, g, context]);
    expect(context.isPanning).toBe(true);

    const draw = vi.spyOn(g, "drawGraph_");
    for (const x of [210, 220, 230, 240]) {
      document.dispatchEvent(mouseEvent("mousemove", x));
    }
    expect(draw).not.toHaveBeenCalled();

    runFrame();
    expect(draw).toHaveBeenCalledTimes(1);
    const afterFrame = g.xAxisRange();

    // Two more moves and then a release inside the same frame: the release has
    // to see the last move, not the position the last frame drew.
    document.dispatchEvent(mouseEvent("mousemove", 260));
    document.dispatchEvent(mouseEvent("mousemove", 300));
    document.dispatchEvent(mouseEvent("mouseup", 300));

    expect(g.xAxisRange()).not.toEqual(afterFrame);
  });
});

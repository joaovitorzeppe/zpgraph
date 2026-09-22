import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import GridPlugin from "../src/plugins/grid";
import type { ZpgraphOptions } from "../src/types";
import {
  mockCanvas,
  mountDiv,
  sampleData,
  type Mock2DContext,
} from "./helpers";

const base: ZpgraphOptions = {
  labels: ["x", "A", "B"],
  width: 480,
  height: 320,
};

const mockCalls = (fn: unknown): unknown[][] => {
  if (typeof fn !== "function" || !("mock" in fn)) {
    throw new Error("expected vitest mock");
  }
  const mock = Reflect.get(fn, "mock");
  if (!mock || typeof mock !== "object" || !("calls" in mock)) {
    throw new Error("expected mock.calls");
  }
  const { calls } = mock;
  if (!Array.isArray(calls)) {
    throw new Error("expected calls array");
  }
  return calls;
};

const freshCtx = (): Mock2DContext => mockCanvas();

const makeChart = (options: ZpgraphOptions = {}) => {
  const el = mountDiv();
  return new Zpgraph(el, sampleData, { ...base, ...options });
};

/**
 * Runs the grid plugin against a real chart but with a private context, so the
 * recorded calls are the grid's alone (the axes plugin and the plotters draw
 * into the chart's own hidden context).
 */
const drawGrid = (g: Zpgraph): Mock2DContext => {
  const ctx = freshCtx();
  const plugin = new GridPlugin();
  Reflect.apply(plugin.willDrawChart, plugin, [
    { zpgraph: g, drawingContext: ctx },
  ]);
  return ctx;
};

/** [x, y] pairs passed to moveTo. */
const segments = (ctx: Mock2DContext) =>
  mockCalls(ctx.moveTo).map((call, i) => {
    const to = mockCalls(ctx.lineTo)[i] ?? [];
    return {
      from: [Number(call[0]), Number(call[1])],
      to: [Number(to[0]), Number(to[1])],
    };
  });

describe("Grid plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("strokes one horizontal line per y tick and one vertical line per x tick", () => {
    const g = makeChart();
    const ctx = drawGrid(g);

    expect(mockCalls(ctx.stroke).length).toBeGreaterThan(0);
    expect(mockCalls(ctx.moveTo).length).toBe(mockCalls(ctx.lineTo).length);
    // Lines that share a style are batched into one path, so there are far
    // fewer strokes than lines: one for the x axis and one per y axis drawn.
    expect(mockCalls(ctx.stroke).length).toBeLessThan(
      mockCalls(ctx.moveTo).length,
    );

    const horizontal = segments(ctx).filter((s) => s.from[1] === s.to[1]!);
    const vertical = segments(ctx).filter((s) => s.from[0] === s.to[0]!);
    expect(horizontal.length).toBeGreaterThan(0);
    expect(vertical.length).toBeGreaterThan(0);
    expect(horizontal.length + vertical.length).toBe(segments(ctx).length);

    g.destroy();
  });

  it("spans the plot area width horizontally and its height vertically", () => {
    const g = makeChart();
    const area = g.getArea();
    const ctx = drawGrid(g);

    const horizontal = segments(ctx).find((s) => s.from[1] === s.to[1]);
    if (!horizontal) {
      throw new Error("expected horizontal segment");
    }
    expect(Number(horizontal.to[0]) - Number(horizontal.from[0])).toBe(area.w);

    const vertical = segments(ctx).find((s) => s.from[0] === s.to[0]);
    if (!vertical) {
      throw new Error("expected vertical segment");
    }
    expect(Number(vertical.to[1])).toBe(area.y);

    g.destroy();
  });

  it("draws nothing when drawGrid is off for every axis", () => {
    const g = makeChart({
      axes: { x: { drawGrid: false }, y: { drawGrid: false } },
    });
    const ctx = drawGrid(g);

    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();

    g.destroy();
  });

  it("keeps only the vertical lines when the y grid is off", () => {
    const g = makeChart({ axes: { y: { drawGrid: false } } });
    const ctx = drawGrid(g);

    expect(segments(ctx).length).toBeGreaterThan(0);
    expect(segments(ctx).every((s) => s.from[0] === s.to[0]!)).toBe(true);

    g.destroy();
  });

  it("keeps only the horizontal lines when the x grid is off", () => {
    const g = makeChart({ axes: { x: { drawGrid: false } } });
    const ctx = drawGrid(g);

    expect(segments(ctx).length).toBeGreaterThan(0);
    expect(segments(ctx).every((s) => s.from[1] === s.to[1]!)).toBe(true);

    g.destroy();
  });

  it("applies gridLinePattern on the x axis and clears it afterwards", () => {
    const g = makeChart({ axes: { x: { gridLinePattern: [5, 5] } } });
    const ctx = drawGrid(g);

    expect(mockCalls(ctx.setLineDash)[0]!).toEqual([[5, 5]]);
    const dashCalls = mockCalls(ctx.setLineDash);
    expect(dashCalls[dashCalls.length - 1]).toEqual([[]]);

    g.destroy();
  });

  it("applies gridLinePattern to the y axis", () => {
    const g = makeChart({
      axes: { x: { drawGrid: false }, y: { gridLinePattern: [2, 3] } },
    });
    const ctx = drawGrid(g);

    // Set once for the whole axis, not once per line, and every line it
    // covers is dashed.
    const dashes = mockCalls(ctx.setLineDash);
    expect(dashes.length).toBe(1);
    expect(segments(ctx).length).toBeGreaterThan(1);
    expect(
      dashes.every((c) => JSON.stringify(c) === JSON.stringify([[2, 3]])),
    ).toBe(true);

    g.destroy();
  });

  it("leaves the pattern untouched when a single-element pattern is given", () => {
    const g = makeChart({
      axes: { x: { gridLinePattern: [5] }, y: { drawGrid: false } },
    });
    const ctx = drawGrid(g);

    expect(segments(ctx).length).toBeGreaterThan(0);
    expect(ctx.setLineDash).not.toHaveBeenCalled();

    g.destroy();
  });

  it("honours gridLineColor and gridLineWidth per axis", () => {
    const g = makeChart({
      axes: {
        x: { drawGrid: false },
        y: { gridLineColor: "rgb(1, 2, 3)", gridLineWidth: 2 },
      },
    });
    const ctx = drawGrid(g);

    expect(ctx.strokeStyle).toBe("rgb(1, 2, 3)");
    expect(ctx.lineWidth).toBe(2);

    g.destroy();
  });

  it("adds the y2 grid only once it is explicitly enabled", () => {
    const withoutY2 = makeChart({
      series: { B: { axis: "y2" } },
      axes: { x: { drawGrid: false } },
    });
    const before = segments(drawGrid(withoutY2)).length;
    withoutY2.destroy();

    const withY2 = makeChart({
      series: { B: { axis: "y2" } },
      axes: { x: { drawGrid: false }, y2: { drawGrid: true } },
    });
    const after = segments(drawGrid(withY2)).length;
    withY2.destroy();

    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
  });

  it("keeps the y2 grid when the y grid is off", () => {
    const g = makeChart({
      series: { B: { axis: "y2" } },
      axes: {
        x: { drawGrid: false },
        y: { drawGrid: false },
        y2: { drawGrid: true },
      },
    });
    const ctx = drawGrid(g);

    expect(segments(ctx).length).toBeGreaterThan(0);

    g.destroy();
  });

  it("runs as part of a real redraw, drawing into the chart hidden context", () => {
    const g = makeChart({ axes: { x: { gridLinePattern: [4, 4] } } });
    const hiddenCtx = Reflect.get(g, "hidden_ctx_");
    if (!hiddenCtx || typeof hiddenCtx !== "object") {
      throw new Error("expected hidden_ctx_");
    }
    const setLineDash = Reflect.get(hiddenCtx, "setLineDash");
    expect(mockCalls(setLineDash)).toContainEqual([[4, 4]]);

    g.destroy();
  });
});

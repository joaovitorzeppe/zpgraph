import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import GridPlugin from "../src/plugins/grid";
import type { ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

const base: ZpgraphOptions = {
  labels: ["x", "A", "B"],
  width: 480,
  height: 320,
};

/** The stub from mockCanvas: every 2d method is a spy. */
type Mock = ReturnType<typeof vi.fn>;
// The canvas methods the grid actually calls are named so they are not
// `Mock | undefined` on every access.
type RecordingCtx = Record<string, Mock> &
  Record<"moveTo" | "lineTo" | "stroke" | "setLineDash", Mock>;

const freshCtx = () =>
  document.createElement("canvas").getContext("2d") as unknown as RecordingCtx;

const makeChart = (options: ZpgraphOptions = {}) => {
  const el = mountDiv();
  return new Zpgraph(el, sampleData, { ...base, ...options });
};

/**
 * Runs the grid plugin against a real chart but with a private context, so the
 * recorded calls are the grid's alone (the axes plugin and the plotters draw
 * into the chart's own hidden context).
 */
const drawGrid = (g: Zpgraph) => {
  const ctx = freshCtx();
  const plugin = new (GridPlugin as unknown as new () => {
    willDrawChart: (e: unknown) => void;
  })();
  plugin.willDrawChart({ zpgraph: g, drawingContext: ctx });
  return ctx;
};

/** [x, y] pairs passed to moveTo. */
const segments = (ctx: RecordingCtx) =>
  ctx.moveTo.mock.calls.map((call, i) => ({
    from: call as [number, number],
    to: ctx.lineTo.mock.calls[i] as [number, number],
  }));

describe("Grid plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("strokes one horizontal line per y tick and one vertical line per x tick", () => {
    const g = makeChart();
    const ctx = drawGrid(g);

    expect(ctx.stroke.mock.calls.length).toBeGreaterThan(0);
    expect(ctx.moveTo.mock.calls.length).toBe(ctx.lineTo.mock.calls.length);
    // Lines that share a style are batched into one path, so there are far
    // fewer strokes than lines: one for the x axis and one per y axis drawn.
    expect(ctx.stroke.mock.calls.length).toBeLessThan(
      ctx.moveTo.mock.calls.length,
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

    const horizontal = segments(ctx).find((s) => s.from[1] === s.to[1]!)!;
    expect(horizontal.to[0] - horizontal.from[0]!).toBe(area.w);

    const vertical = segments(ctx).find((s) => s.from[0] === s.to[0]!)!;
    expect(vertical.to[1]!).toBe(area.y);

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

    expect(ctx.setLineDash.mock.calls[0]!).toEqual([[5, 5]]);
    const dashCalls = ctx.setLineDash.mock.calls;
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
    const dashes = ctx.setLineDash.mock.calls;
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
    const ctx = drawGrid(g) as unknown as Record<string, unknown>;

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
    const hiddenCtx = (g as unknown as { hidden_ctx_: RecordingCtx })
      .hidden_ctx_;

    expect(hiddenCtx.setLineDash.mock.calls).toContainEqual([[4, 4]]);

    g.destroy();
  });
});

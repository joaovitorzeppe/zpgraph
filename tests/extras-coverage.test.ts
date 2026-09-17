import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import Crosshair from "../src/extras/crosshair";
import shapes from "../src/extras/shapes";
import smoothPlotter from "../src/extras/smooth-plotter";
import { synchronize } from "../src/extras/synchronizer";
import Unzoom from "../src/extras/unzoom";
import { mockCanvas, mountDiv, recordingCanvas, sampleData } from "./helpers";

const makeChart = (opts: Record<string, unknown> = {}) =>
  new Zpgraph(mountDiv(), sampleData, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    ...opts,
  }) as unknown as Record<string, any>;

describe("shapes extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("registers custom shapes on Zpgraph.Circles via default export", () => {
    expect(shapes).toBe(Zpgraph.Circles);
    expect(typeof Zpgraph.Circles.CIRCLE).toBe("function");
    expect(typeof Zpgraph.Circles.SQUARE).toBe("function");
    expect(typeof Zpgraph.Circles.STAR).toBe("function");
  });

  it("CIRCLE draws arc, fill and stroke", () => {
    const ctx = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
    };

    Zpgraph.Circles.CIRCLE!(
      null,
      "A",
      ctx as unknown as CanvasRenderingContext2D,
      50,
      60,
      "#f00",
      4,
      0,
    );

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalledWith(50, 60, 4, 0, 2 * Math.PI, false);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.strokeStyle).toBe("#f00");
    expect(ctx.fillStyle).toBe("white");
  });

  it("SQUARE draws a filled polygon with stroke", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
      fillStyle: "",
    };

    Zpgraph.Circles.SQUARE!(
      null,
      "B",
      ctx as unknown as CanvasRenderingContext2D,
      30,
      40,
      "#0f0",
      6,
      0,
    );

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("draws custom shapes through drawPointCallback on a chart", () => {
    mockCanvas();
    const drawPointCallback = vi.fn((...args: unknown[]) => {
      const shape = Zpgraph.Circles.CIRCLE!;
      shape(...(args as Parameters<typeof shape>));
    });

    const g = makeChart({
      drawPoints: true,
      drawPointCallback,
    });

    expect(drawPointCallback).toHaveBeenCalled();
    g.destroy();
  });
});

describe("smooth-plotter extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("exports the plotter on Zpgraph.smoothPlotter", () => {
    expect(smoothPlotter).toBe((Zpgraph as any).smoothPlotter);
    expect(typeof smoothPlotter).toBe("function");
    expect(smoothPlotter.smoothing).toBe(1 / 3);
  });

  it("draws a smooth curve without throwing", () => {
    const canvas = recordingCanvas();
    const g = makeChart({ plotter: smoothPlotter });

    expect(canvas.countOf("bezierCurveTo")).toBeGreaterThan(0);
    expect(canvas.countOf("stroke")).toBeGreaterThan(0);
    g.destroy();
  });

  it("computes control points for spline segments", () => {
    const [l1x, l1y, r1x, r1y] = smoothPlotter._getControlPoints(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    );

    expect(l1x).toBeCloseTo(20 / 3, 6);
    expect(l1y).toBeCloseTo(10, 6);
    expect(r1x).toBeCloseTo(40 / 3, 6);
    expect(r1y).toBeCloseTo(10, 6);
  });
});

describe("synchronizer extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("syncs selection between charts via highlightCallback", () => {
    const g1 = makeChart();
    const g2 = makeChart();
    const sync = (synchronize as any)(g1, g2, { zoom: false, selection: true });

    g1.setSelection(1, undefined, undefined, true);

    expect(g1.getSelection()).toBe(1);
    expect(g2.getSelection()).toBe(1);

    sync.detach();
    g1.destroy();
    g2.destroy();
  });

  it("syncs zoom between charts", () => {
    const g1 = makeChart();
    const g2 = makeChart();
    const sync = (synchronize as any)(g1, g2, { zoom: true, selection: false });

    g1.updateOptions({ dateWindow: [2, 3] });

    expect(g2.getOption("dateWindow")).toEqual([2, 3]);

    sync.detach();
    g1.destroy();
    g2.destroy();
  });

  it("accepts an array of charts and detaches cleanly", () => {
    const g1 = makeChart();
    const g2 = makeChart();
    const sync = (synchronize as any)([g1, g2], {
      selection: false,
      zoom: true,
    });

    g1.updateOptions({ dateWindow: [1.5, 2.5] });
    expect(g2.getOption("dateWindow")).toEqual([1.5, 2.5]);

    sync.detach();
    g1.updateOptions({ dateWindow: [3, 4] });
    expect(g2.getOption("dateWindow")).toEqual([1.5, 2.5]);

    g1.destroy();
    g2.destroy();
  });
});

describe("crosshair extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("adds a canvas to the chart and draws on selection", () => {
    const plugin = new Crosshair({ direction: "both" });
    const g = makeChart({ plugins: [plugin] });

    const canvas = g.graphDiv.querySelector("canvas");
    expect(canvas).not.toBe(null);
    expect(g.graphDiv.contains(plugin.canvas_)).toBe(true);

    g.setSelection(1);

    expect(canvas!.width).toBe(480);
    expect(canvas!.height).toBe(320);

    g.clearSelection();
    g.destroy();
  });

  it("registers on Zpgraph.Plugins.Crosshair", () => {
    expect(Zpgraph.Plugins.Crosshair).toBe(Crosshair);
  });
});

describe("unzoom extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("shows the reset button on mouseover when zoomed and resets on click", () => {
    const plugin = new Unzoom();
    const g = makeChart({ plugins: [plugin] });
    const full = g.xAxisRange();

    const button = g.graphDiv.querySelector("button");
    expect(button).not.toBe(null);
    expect(button!.textContent).toBe("Reset Zoom");
    expect((button as HTMLButtonElement).style.display).toBe("none");

    g.updateOptions({ dateWindow: [2, 3] });
    expect(g.isZoomed()).toBe(true);

    g.graphDiv.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect((button as HTMLButtonElement).style.display).not.toBe("none");

    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(g.xAxisRange()[0]).toBeCloseTo(full[0], 6);
    expect(g.xAxisRange()[1]).toBeCloseTo(full[1], 6);

    expect(document.body.contains(button)).toBe(true);
    g.destroy();
    expect(document.body.contains(button!)).toBe(false);
  });

  it("hides the button on mouseout", () => {
    const plugin = new Unzoom();
    const g = makeChart({ plugins: [plugin] });

    g.updateOptions({ dateWindow: [2, 3] });
    const button = g.graphDiv.querySelector("button") as HTMLButtonElement;

    g.graphDiv.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(button.style.display).not.toBe("none");

    g.graphDiv.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    expect(button.style.display).toBe("none");

    g.destroy();
  });

  it("registers on Zpgraph.Plugins.Unzoom", () => {
    expect(Zpgraph.Plugins.Unzoom).toBe(Unzoom);
  });
});

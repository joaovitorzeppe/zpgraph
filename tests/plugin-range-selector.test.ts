import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import RangeSelectorPlugin from "../src/plugins/range-selector";
import type { ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv, sampleData, stubLayoutMetrics } from "./helpers";

const base: ZpgraphOptions = {
  labels: ["x", "A", "B"],
  width: 480,
  height: 320,
};

const makeChart = (options: ZpgraphOptions = {}) => {
  const el = mountDiv();
  const g = new Zpgraph(el, sampleData, {
    plugins: [RangeSelectorPlugin],
    ...base,
    ...options,
  });
  return { el, g };
};

const parts = (el: HTMLElement) => ({
  bg: el.querySelector<HTMLCanvasElement>(".zpgraph-rangesel-bgcanvas"),
  fg: el.querySelector<HTMLCanvasElement>(".zpgraph-rangesel-fgcanvas"),
  handles: el.querySelectorAll<HTMLImageElement>(
    ".zpgraph-rangesel-zoomhandle",
  ),
});

/** The plugin keeps its canvases and contexts private; tests reach in by name. */
const rangeSelectorOf = (g: Zpgraph): object => {
  const plugins = Reflect.get(g, "plugins_");
  if (!Array.isArray(plugins)) {
    throw new Error("expected plugins_");
  }
  for (const entry of plugins) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const plugin = Reflect.get(entry, "plugin");
    if (plugin && typeof plugin === "object" && "fgcanvas_" in plugin) {
      return plugin;
    }
  }
  throw new Error("range selector not found");
};

const ctxMock = (ctxHolder: object, key: string): object => {
  const ctx = Reflect.get(ctxHolder, key);
  if (!ctx || typeof ctx !== "object") {
    throw new Error(`expected ${key}`);
  }
  return ctx;
};

const expectCalled = (ctx: object, method: string) => {
  const fn = Reflect.get(ctx, method);
  expect(fn).toHaveBeenCalled();
};

const mouse = (type: string, target: EventTarget, clientX: number) =>
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX, clientY: 0, button: 0 }),
  );

describe("RangeSelector plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds nothing to the chart while showRangeSelector is off", () => {
    const { el, g } = makeChart();

    const { bg, fg, handles } = parts(el);
    expect(bg).toBeNull();
    expect(fg).toBeNull();
    expect(handles).toHaveLength(0);

    g.destroy();
  });

  it("creates the two canvases and the two zoom handles when enabled", () => {
    const { el, g } = makeChart({ showRangeSelector: true });

    const { bg, fg, handles } = parts(el);
    expect(bg).not.toBeNull();
    expect(fg).not.toBeNull();
    expect(handles).toHaveLength(2);
    expect(bg!.parentElement).toBe(fg!.parentElement);
    expect(handles[0]!.tagName).toBe("IMG");
    expect(handles[0]!.src.startsWith("data:image/png;base64,")).toBe(true);

    g.destroy();
  });

  it("sizes the canvases to rangeSelectorHeight below the plot area", () => {
    const { el, g } = makeChart({
      showRangeSelector: true,
      rangeSelectorHeight: 50,
    });

    const { bg, fg } = parts(el);
    const area = g.getArea();
    expect(bg!.style.height).toBe("50px");
    expect(fg!.style.height).toBe("50px");
    expect(bg!.style.width).toBe(`${area.w}px`);
    expect(parseFloat(bg!.style.top)).toBeGreaterThan(area.y + area.h);

    g.destroy();
  });

  it("reserves vertical space so the plot area shrinks", () => {
    const { g: plain } = makeChart();
    const plainHeight = plain.getArea().h;
    plain.destroy();

    const { g } = makeChart({
      showRangeSelector: true,
      rangeSelectorHeight: 40,
    });
    expect(g.getArea().h).toBeLessThanOrEqual(plainHeight - 40);
    g.destroy();
  });

  it("places both zoom handles and makes them visible after the first draw", () => {
    const { el, g } = makeChart({ showRangeSelector: true });

    const { handles } = parts(el);
    expect(handles.length).toBeGreaterThanOrEqual(2);
    const left = handles[0]!;
    const right = handles[1]!;
    expect(left.style.visibility).toBe("visible");
    expect(right.style.visibility).toBe("visible");
    expect(parseFloat(left.style.left)).toBeLessThan(
      parseFloat(right.style.left),
    );
    expect(left.style.top).toBe(right.style.top);

    g.destroy();
  });

  it("draws the mini plot and the frame into the background canvas", () => {
    const { g } = makeChart({ showRangeSelector: true });

    const ctx = ctxMock(rangeSelectorOf(g), "bgcanvas_ctx_");
    expectCalled(ctx, "clearRect");
    expectCalled(ctx, "stroke");
    // The mini plot is filled with a gradient built from the fill options.
    expectCalled(ctx, "createLinearGradient");
    expectCalled(ctx, "fill");

    g.destroy();
  });

  it("draws the unzoomed frame into the foreground canvas", () => {
    const { g } = makeChart({ showRangeSelector: true });

    const ctx = ctxMock(rangeSelectorOf(g), "fgcanvas_ctx_");
    expectCalled(ctx, "clearRect");
    expectCalled(ctx, "stroke");
    // Nothing is zoomed yet, so no veil is painted over the edges.
    expect(Reflect.get(ctx, "fillRect")).not.toHaveBeenCalled();

    g.destroy();
  });

  it("adds the selector when the option is turned on via updateOptions", () => {
    const { el, g } = makeChart();
    expect(parts(el).bg).toBeNull();

    g.updateOptions({ showRangeSelector: true });

    const { bg, fg, handles } = parts(el);
    expect(bg).not.toBeNull();
    expect(fg).not.toBeNull();
    expect(handles).toHaveLength(2);

    g.destroy();
  });

  it("removes the selector when the option is turned off via updateOptions", () => {
    vi.useFakeTimers();
    const { el, g } = makeChart({ showRangeSelector: true });
    expect(parts(el).handles).toHaveLength(2);

    g.updateOptions({ showRangeSelector: false });

    expect(parts(el).bg).toBeNull();
    expect(parts(el).fg).toBeNull();
    expect(parts(el).handles).toHaveLength(0);

    // Turning it off schedules a resize; it must not put the elements back.
    vi.runAllTimers();
    expect(parts(el).bg).toBeNull();

    g.destroy();
  });

  it("survives being toggled off and on again", () => {
    vi.useFakeTimers();
    const { el, g } = makeChart({ showRangeSelector: true });

    g.updateOptions({ showRangeSelector: false });
    vi.runAllTimers();
    g.updateOptions({ showRangeSelector: true });

    const { bg, fg, handles } = parts(el);
    expect(bg).not.toBeNull();
    expect(fg).not.toBeNull();
    expect(handles).toHaveLength(2);

    g.destroy();
  });

  it("disables animatedZooms, which is incompatible with the selector", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { g } = makeChart({ showRangeSelector: true, animatedZooms: true });

    expect(g.getOption("animatedZooms")).toBe(false);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    g.destroy();
  });

  it("changes dateWindow when a zoom handle is dragged", () => {
    const { el, g } = makeChart({ showRangeSelector: true });
    const { handles, fg } = parts(el);
    const left = handles[0]!;
    const right = handles[1]!;

    const rangeBefore = g.xAxisRange();
    const leftCenter = parseFloat(left.style.left) + left.width / 2;

    stubLayoutMetrics(left, {
      width: left.width,
      height: left.height,
      left: leftCenter - left.width / 2,
      top: parseFloat(left.style.top),
    });
    stubLayoutMetrics(right, {
      width: right.width,
      height: right.height,
      left: parseFloat(right.style.left),
      top: parseFloat(right.style.top),
    });
    if (fg) {
      stubLayoutMetrics(fg, {
        width: g.getArea().w,
        height: 50,
        left: 0,
        top: 300,
      });
    }

    mouse("dragstart", left, leftCenter);
    mouse("mousemove", document, leftCenter + 60);
    mouse("mouseup", document, leftCenter + 60);

    const rangeAfter = g.xAxisRange();
    expect(rangeAfter[0]).toBeGreaterThan(rangeBefore[0]);
    expect(rangeAfter[1]).toBeLessThanOrEqual(rangeBefore[1]);

    g.destroy();
  });

  it("drops the canvas references on destroy", () => {
    const { g } = makeChart({ showRangeSelector: true });
    const plugin = rangeSelectorOf(g);

    g.destroy();

    expect(Reflect.get(plugin, "bgcanvas_")).toBeNull();
    expect(Reflect.get(plugin, "fgcanvas_")).toBeNull();
    expect(Reflect.get(plugin, "leftZoomHandle_")).toBeNull();
    expect(Reflect.get(plugin, "rightZoomHandle_")).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import ZoomLimits, {
  clampDateWindow,
  zoomBy,
  panBy,
} from "../src/extras/zoom-limits";
import Measure from "../src/extras/measure";
import Keyboard from "../src/extras/keyboard";
import BrushSelect from "../src/extras/brush-select";
import UrlSync from "../src/extras/url-sync";
import {
  createMovingAveragePlotter,
  default as movingAveragePlotter,
} from "../src/extras/moving-average";
import { createFillBetweenPlotter } from "../src/extras/fill-between";
import { applyLocale, packs } from "../src/extras/locale";
import SpanBands, { writeTextInGraph } from "../src/extras/span-bands";
import type { ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

const makeChart = (opts: Partial<ZpgraphOptions> = {}) =>
  new Zpgraph(mountDiv(), sampleData, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    ...opts,
  });

describe("zoom-limits extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("registers ZoomLimits plugin and clamps min span", () => {
    const plugin = new ZoomLimits({ minSpanMs: 2 });
    const g = makeChart({ plugins: [plugin] });
    const extremes = g.xAxisExtremes();
    const mid = (extremes[0] + extremes[1]) / 2;
    const tiny: [number, number] = [mid - 0.01, mid + 0.01];
    const clamped = clampDateWindow(g, tiny, { minSpanMs: 2 });
    expect(clamped[1] - clamped[0]).toBe(2);
    // Extreme zoom-in hits min span → no change once already at min.
    g.updateOptions({ dateWindow: clamped });
    expect(zoomBy(g, 0.01)).toBe(false);
    expect(panBy(g, 0)).toBe(false);
    g.destroy();
  });

  it("wraps updateOptions dateWindow", () => {
    const plugin = new ZoomLimits({
      minSpanMs: 2,
      clampToData: true,
    });
    const g = makeChart({ plugins: [plugin] });
    const extremes = g.xAxisExtremes();
    const mid = (extremes[0] + extremes[1]) / 2;
    g.updateOptions({ dateWindow: [mid - 0.01, mid + 0.01] });
    const [lo, hi] = g.xAxisRange();
    expect(hi - lo).toBeGreaterThanOrEqual(2 - 1e-9);
    g.destroy();
  });
});

describe("measure extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("activates and clears", () => {
    const onMeasure = vi.fn();
    const measure = new Measure({ onMeasure });
    const g = makeChart({ plugins: [measure] });
    expect(measure.toString()).toBe("Measure Plugin");
    measure.click({
      zpgraph: g,
      canvasx: 100,
      canvasy: 100,
    });
    expect(measure.a_).toBeTruthy();
    measure.clear();
    expect(measure.a_).toBeNull();
    g.destroy();
  });
});

describe("keyboard extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("handles Escape reset", () => {
    const kb = new Keyboard();
    const g = makeChart({
      plugins: [new ZoomLimits({ minSpanMs: 86400000 }), kb],
    });
    const extremes = g.xAxisExtremes();
    const mid = (extremes[0] + extremes[1]) / 2;
    g.updateOptions({
      dateWindow: [mid - 5 * 86400000, mid + 5 * 86400000],
    });
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    g.graphDiv.dispatchEvent(esc);
    expect(g.isZoomed()).toBe(false);
    g.destroy();
  });

  it("pans with arrows when window is partial", () => {
    const kb = new Keyboard();
    const g = makeChart({
      plugins: [new ZoomLimits({ minSpanMs: 0.5 }), kb],
    });
    const extremes = g.xAxisExtremes();
    const mid = (extremes[0] + extremes[1]) / 2;
    const half = (extremes[1] - extremes[0]) / 4;
    g.updateOptions({ dateWindow: [mid - half, mid + half] });
    const before = g.xAxisRange();
    g.graphDiv.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    const after = g.xAxisRange();
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
    g.destroy();
  });

  it("lets core handle arrows when pan is a no-op", () => {
    const kb = new Keyboard();
    const g = makeChart({ plugins: [kb] });
    g.graphDiv.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(g.getSelection()).toBe(0);
    g.destroy();
  });
});

describe("brush-select extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("toggles active interaction model", () => {
    const onSelect = vi.fn();
    const brush = new BrushSelect({ onSelect });
    const g = makeChart({ plugins: [brush] });
    expect(brush.isActive()).toBe(false);
    brush.setActive(true);
    expect(brush.isActive()).toBe(true);
    brush.setActive(false);
    expect(brush.isActive()).toBe(false);
    g.destroy();
  });
});

describe("url-sync extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
    history.replaceState(null, "", "/");
  });

  it("writes from/to on zoomCallback path", () => {
    const sync = new UrlSync();
    const g = makeChart({ plugins: [sync] });
    const extremes = g.xAxisExtremes();
    const mid = (extremes[0] + extremes[1]) / 2;
    const lo = mid - 10 * 86400000;
    const hi = mid + 10 * 86400000;
    g.updateOptions({ dateWindow: [lo, hi] });
    // trigger zoomCallback via doZoomXDates_
    g.doZoomXDates_(lo, hi);
    expect(location.search.includes("from=")).toBe(true);
    g.destroy();
  });
});

describe("moving-average extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("exports plotter factory", () => {
    expect(typeof createMovingAveragePlotter).toBe("function");
    expect(typeof movingAveragePlotter).toBe("function");
    const opts: Partial<ZpgraphOptions> = {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    };
    Reflect.set(opts, "plotter", [
      Zpgraph.Plotters.linePlotter,
      createMovingAveragePlotter({ period: 3 }),
    ]);
    const g = new Zpgraph(mountDiv(), sampleData, opts);
    g.destroy();
  });
});

describe("fill-between extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("draws without throwing", () => {
    const opts: Partial<ZpgraphOptions> = {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    };
    Reflect.set(opts, "plotter", [
      createFillBetweenPlotter({ seriesA: "A", seriesB: "B" }),
      Zpgraph.Plotters.linePlotter,
    ]);
    const g = new Zpgraph(mountDiv(), sampleData, opts);
    g.destroy();
  });
});

describe("locale packs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("applies pt pack and toolbar labels", () => {
    const toolbar = Zpgraph.Plugins.Toolbar;
    if (!toolbar) {
      throw new Error("Toolbar plugin missing");
    }
    const g = makeChart({ plugins: [toolbar], toolbar: true });
    applyLocale(g, packs.pt);
    const locale = Reflect.get(g, "locale_");
    expect(
      locale &&
        typeof locale === "object" &&
        "decimalPoint" in locale &&
        locale.decimalPoint,
    ).toBe(",");
    expect(packs.en.months).toHaveLength(12);
    expect(packs.es.toolbar.zoomin).toBe("Acercar");
    g.destroy();
  });
});

describe("span-bands extra", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("activates and writeTextInGraph draws", () => {
    const bands = new SpanBands({
      bands: [{ x0: 0, x1: 1, color: "red", label: "A" }],
    });
    const g = makeChart({ plugins: [bands] });
    expect(bands.toString()).toBe("SpanBands Plugin");
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
    };
    Reflect.apply(writeTextInGraph, undefined, [ctx, "hi", 10, 10]);
    expect(ctx.fillText).toHaveBeenCalled();
    g.destroy();
  });
});

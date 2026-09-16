import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import { mockCanvas, mountDiv } from "./helpers";

/**
 * A chart painted on a canvas is invisible to a screen reader and unreachable
 * by keyboard. These pin the way out of both: a described image, a focusable
 * container, and keys that move the selection.
 */

const data = Array.from({ length: 20 }, (_, i) => [i, i, 20 - i]);

const makeChart = (opts: Record<string, unknown> = {}) => {
  const el = mountDiv();
  const g = new Zpgraph(el, data, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    axes: { x: { valueFormatter: (v: number) => String(v) } },
    ...opts,
  }) as unknown as Record<string, any>;
  return { el, g };
};

const press = (el: HTMLElement, key: string) => {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(e);
  return e;
};

describe("screen reader description", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("describes the chart, its series and its x range on the canvas", () => {
    const { el, g } = makeChart({ title: "Sales" });

    const canvas = el.querySelector('canvas[role="img"]') as HTMLCanvasElement;
    const label = canvas.getAttribute("aria-label")!;
    expect(label).toContain("Sales");
    expect(label).toContain("A, B");
    expect(label).toContain("x from 0 to 19");

    g.destroy();
  });

  it("hides the second canvas, which shows the same picture", () => {
    const { el, g } = makeChart();

    const canvases = Array.from(el.querySelectorAll("canvas"));
    expect(
      canvases.filter((c) => c.getAttribute("role") === "img").length,
    ).toBe(1);
    expect(
      canvases.filter((c) => c.getAttribute("aria-hidden") === "true").length,
    ).toBe(1);

    g.destroy();
  });

  it("follows a zoom, because the range it names changed", () => {
    const { el, g } = makeChart();
    const canvas = el.querySelector('canvas[role="img"]') as HTMLCanvasElement;

    g.updateOptions({ dateWindow: [5, 10] });

    expect(canvas.getAttribute("aria-label")).toContain("x from 5 to 10");
    g.destroy();
  });

  it("announces the legend politely when the selection moves", () => {
    const { el, g } = makeChart();

    expect(el.querySelector(".zpgraph-legend")!.getAttribute("aria-live")).toBe(
      "polite",
    );
    g.destroy();
  });
});

describe("keyboard navigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("puts the chart in the tab order", () => {
    const { g } = makeChart();
    expect(g.graphDiv.tabIndex).toBe(0);
    g.destroy();
  });

  it("walks the points with the arrow keys", () => {
    const { g } = makeChart();

    press(g.graphDiv, "ArrowRight");
    expect(g.getSelection()).toBe(0);

    press(g.graphDiv, "ArrowRight");
    press(g.graphDiv, "ArrowRight");
    expect(g.getSelection()).toBe(2);

    press(g.graphDiv, "ArrowLeft");
    expect(g.getSelection()).toBe(1);

    g.destroy();
  });

  it("stops at the ends instead of wrapping", () => {
    const { g } = makeChart();

    press(g.graphDiv, "Home");
    expect(g.getSelection()).toBe(0);
    press(g.graphDiv, "ArrowLeft");
    expect(g.getSelection()).toBe(0);

    press(g.graphDiv, "End");
    expect(g.getSelection()).toBe(data.length - 1);
    press(g.graphDiv, "ArrowRight");
    expect(g.getSelection()).toBe(data.length - 1);

    g.destroy();
  });

  it("Escape drops the selection and the zoom", () => {
    const { g } = makeChart();
    g.updateOptions({ dateWindow: [5, 10] });
    press(g.graphDiv, "ArrowRight");

    press(g.graphDiv, "Escape");

    expect(g.getSelection()).toBe(-1);
    expect(g.xAxisRange()).toEqual([0, data.length - 1]);
    g.destroy();
  });

  it("leaves keys it does not handle to the page", () => {
    const { g } = makeChart();

    const tab = press(g.graphDiv, "Tab");
    expect(tab.defaultPrevented).toBe(false);

    const arrow = press(g.graphDiv, "ArrowRight");
    expect(arrow.defaultPrevented).toBe(true);

    g.destroy();
  });

  it("ignores an arrow that is part of a browser shortcut", () => {
    const { g } = makeChart();

    const e = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    g.graphDiv.dispatchEvent(e);

    expect(g.getSelection()).toBe(-1);
    expect(e.defaultPrevented).toBe(false);
    g.destroy();
  });

  it("Shift+arrows pan and zoom the x window", () => {
    const { g } = makeChart();
    g.updateOptions({ dateWindow: [5, 15] });

    const shift = (key: string) => {
      const e = new KeyboardEvent("keydown", {
        key,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      g.graphDiv.dispatchEvent(e);
      return e;
    };

    const before = g.xAxisRange();
    expect(shift("ArrowRight").defaultPrevented).toBe(true);
    const afterPan = g.xAxisRange();
    expect(afterPan[0]).toBeGreaterThan(before[0]);
    expect(afterPan[1] - afterPan[0]).toBeCloseTo(before[1] - before[0], 8);

    const midBefore = (afterPan[0] + afterPan[1]) / 2;
    shift("ArrowUp");
    const afterZoom = g.xAxisRange();
    expect(afterZoom[1] - afterZoom[0]).toBeLessThan(afterPan[1] - afterPan[0]);
    expect((afterZoom[0] + afterZoom[1]) / 2).toBeCloseTo(midBefore, 5);

    g.destroy();
  });

  it("marks the focusable container for :focus-visible styling", () => {
    const { g } = makeChart();
    expect(g.graphDiv.classList.contains("zpgraph")).toBe(true);
    g.destroy();
  });
});

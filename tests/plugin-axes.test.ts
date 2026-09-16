import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import type { ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

const base: ZpgraphOptions = {
  labels: ["x", "A", "B"],
  width: 480,
  height: 320,
  // The default x formatter treats values as dates; plain numbers read better.
  axes: { x: { axisLabelFormatter: (v) => String(v) } },
};

const makeChart = (options: ZpgraphOptions = {}) => {
  const el = mountDiv();
  const g = new Zpgraph(el, sampleData, {
    ...base,
    ...options,
    axes: { ...base.axes, ...options.axes },
  });
  return { el, g };
};

const texts = (el: HTMLElement, selector: string) =>
  Array.from(el.querySelectorAll(selector), (n) => n.textContent);

describe("Axes plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("creates a label div per tick on both axes", () => {
    const { el, g } = makeChart();

    const xLabels = el.querySelectorAll(".zpgraph-axis-label-x");
    const yLabels = el.querySelectorAll(".zpgraph-axis-label-y");
    expect(xLabels.length).toBeGreaterThan(0);
    expect(yLabels.length).toBeGreaterThan(0);

    // Every tick div carries the shared class as well.
    for (const node of [...xLabels, ...yLabels]) {
      expect(node.classList.contains("zpgraph-axis-label")).toBe(true);
      expect(node.textContent).not.toBe("");
    }

    g.destroy();
  });

  it("positions x labels below the plot area and y labels to its left", () => {
    const { el, g } = makeChart();
    const area = g.getArea();

    const xOuter = el.querySelector(".zpgraph-axis-label-x")!.parentElement!;
    expect(xOuter.style.position).toBe("absolute");
    expect(xOuter.style.textAlign).not.toBe("");
    expect(parseFloat(xOuter.style.top)).toBeGreaterThanOrEqual(
      area.y + area.h,
    );

    const yOuter = el.querySelector(".zpgraph-axis-label-y")!.parentElement!;
    expect(yOuter.style.position).toBe("absolute");
    expect(yOuter.style.textAlign).toBe("right");
    expect(parseFloat(yOuter.style.left)).toBeLessThan(area.x);
    expect(yOuter.style.width).toBe("50px");

    g.destroy();
  });

  it("splits labels between y1 and y2 when a series moves to the second axis", () => {
    const { el, g } = makeChart({ series: { B: { axis: "y2" } } });

    expect(g.numAxes()).toBe(2);
    expect(
      el.querySelectorAll(".zpgraph-axis-label-y1").length,
    ).toBeGreaterThan(0);
    expect(
      el.querySelectorAll(".zpgraph-axis-label-y2").length,
    ).toBeGreaterThan(0);

    // The right-hand labels sit past the right edge of the plot area.
    const area = g.getArea();
    const y2Outer = el.querySelector(".zpgraph-axis-label-y2")!.parentElement!;
    expect(parseFloat(y2Outer.style.left)).toBeGreaterThanOrEqual(
      area.x + area.w,
    );
    expect(y2Outer.style.textAlign).toBe("left");

    g.destroy();
  });

  it("runs tick values through a custom axisLabelFormatter", () => {
    const { el, g } = makeChart({
      axes: {
        x: { axisLabelFormatter: (v) => `x=${v}` },
        y: { axisLabelFormatter: (v) => `y=${v}` },
      },
    });

    const xTexts = texts(el, ".zpgraph-axis-label-x");
    const yTexts = texts(el, ".zpgraph-axis-label-y");
    expect(xTexts.length).toBeGreaterThan(0);
    expect(yTexts.length).toBeGreaterThan(0);
    expect(xTexts.every((t) => t!.startsWith("x="))).toBe(true);
    expect(yTexts.every((t) => t!.startsWith("y="))).toBe(true);

    g.destroy();
  });

  it("draws no labels at all when drawAxis is off for every axis", () => {
    const { el, g } = makeChart({
      axes: {
        x: { drawAxis: false },
        y: { drawAxis: false },
        y2: { drawAxis: false },
      },
    });

    expect(el.querySelectorAll(".zpgraph-axis-label")).toHaveLength(0);

    g.destroy();
  });

  it("keeps only the x labels when the y axis is turned off", () => {
    const { el, g } = makeChart({
      axes: { y: { drawAxis: false }, y2: { drawAxis: false } },
    });

    expect(el.querySelectorAll(".zpgraph-axis-label-x").length).toBeGreaterThan(
      0,
    );
    expect(el.querySelectorAll(".zpgraph-axis-label-y")).toHaveLength(0);

    g.destroy();
  });

  it("detaches the old labels on redraw instead of stacking new ones", () => {
    const { el, g } = makeChart();
    const before = el.querySelectorAll(".zpgraph-axis-label").length;

    g.updateOptions({ valueRange: [0, 50] });
    g.updateOptions({ valueRange: [0, 50] });

    expect(el.querySelectorAll(".zpgraph-axis-label").length).toBeGreaterThan(
      0,
    );
    expect(
      el.querySelectorAll(".zpgraph-axis-label").length,
    ).toBeLessThanOrEqual(before * 2);
    // No duplicate label text for the same tick.
    const ys = texts(el, ".zpgraph-axis-label-y");
    expect(new Set(ys).size).toBe(ys.length);

    g.destroy();
  });

  it("reuses the label nodes across redraws instead of recreating them", () => {
    const { el, g } = makeChart();
    const before = Array.from(el.querySelectorAll(".zpgraph-axis-label-x"));

    g.updateOptions({ dateWindow: [2, 8] });

    const after = Array.from(el.querySelectorAll(".zpgraph-axis-label-x"));
    expect(after.length).toBeGreaterThan(0);
    // Same nodes, new text.
    expect(after[0]!).toBe(before[0]!);
    expect(texts(el, ".zpgraph-axis-label-x")).not.toEqual(
      before.map(() => ""),
    );

    g.destroy();
  });

  it("removes the labels of an axis that stops being drawn", () => {
    const { el, g } = makeChart();
    expect(el.querySelectorAll(".zpgraph-axis-label-y").length).toBeGreaterThan(
      0,
    );

    g.updateOptions({ axes: { y: { drawAxis: false } } });

    expect(el.querySelectorAll(".zpgraph-axis-label-y").length).toBe(0);
    expect(el.querySelectorAll(".zpgraph-axis-label-x").length).toBeGreaterThan(
      0,
    );

    g.destroy();
  });

  it("reserves horizontal space for the axis labels in the layout", () => {
    const { g } = makeChart();
    const withAxes = g.getArea();
    g.destroy();

    const { g: g2 } = makeChart({
      axes: {
        x: { drawAxis: false },
        y: { drawAxis: false },
        y2: { drawAxis: false },
      },
    });
    const withoutAxes = g2.getArea();
    g2.destroy();

    expect(withAxes.x).toBeGreaterThan(withoutAxes.x);
    expect(withAxes.h).toBeLessThan(withoutAxes.h);
  });
});

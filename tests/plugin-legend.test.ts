import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import type { LegendData, ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv, sampleData, stubLayoutMetrics } from "./helpers";

const base: ZpgraphOptions = {
  labels: ["x", "A", "B"],
  width: 480,
  height: 320,
};

/** Builds a chart and hands back the div the Legend plugin owns. */
const makeChart = (options: ZpgraphOptions = {}) => {
  const el = mountDiv();
  const g = new Zpgraph(el, sampleData, { ...base, ...options });
  const legend = el.querySelector(".zpgraph-legend") as HTMLElement;
  return { el, g, legend };
};

describe("Legend plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("creates its own div and fills it when tooltip.show is 'always'", () => {
    const { g, legend } = makeChart({ tooltip: { show: "always" } });

    expect(legend).not.toBeNull();
    expect(legend.textContent).toContain("A");
    expect(legend.textContent).toContain("B");
    // One dash swatch per visible series.
    expect(legend.querySelectorAll(".zpgraph-legend-line")).toHaveLength(2);

    g.destroy();
  });

  it("stays empty with default tooltip.show 'onmouseover' until something is selected", () => {
    const { g, legend } = makeChart();

    expect(legend.innerHTML).toBe("");

    g.setSelection(1);
    expect(legend.innerHTML).not.toBe("");
    expect(legend.textContent).toContain("15");

    g.destroy();
  });

  it("separates series with <br /> when labelsSeparateLines is on", () => {
    const { g, legend } = makeChart({
      tooltip: { show: "always" },
      labelsSeparateLines: true,
    });

    expect(legend.innerHTML).toContain("<br>");

    g.destroy();
  });

  it("joins series with a space when labelsSeparateLines is off", () => {
    const { g, legend } = makeChart({ tooltip: { show: "always" } });

    expect(legend.innerHTML).not.toContain("<br>");

    g.destroy();
  });

  it("marks the highlighted series with the highlight class", () => {
    const { g, legend } = makeChart({ tooltip: { show: "always" } });

    g.setSelection(1, "A");

    const highlighted = legend.querySelectorAll("span.highlight");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.textContent).toContain("A");

    g.destroy();
  });

  it("hands the legendFormatter the series data and renders what it returns", () => {
    let seen: LegendData | null = null;
    const { g, legend } = makeChart({
      tooltip: { show: "always" },
      legendFormatter: (data) => {
        seen = data;
        return `<b>${data.series.map((s) => s.label).join("|")}</b>`;
      },
    });

    expect(legend.innerHTML).toBe("<b>A|B</b>");
    expect(seen).not.toBeNull();
    const data = seen as unknown as LegendData;
    expect(data.x).toBeUndefined();
    expect(data.series.map((s) => s.label)).toEqual(["A", "B"]);
    expect(data.series[0]!.color).toBeTruthy();
    expect(data.series[0]!.isVisible).toBe(true);

    g.destroy();
  });

  it("appends a DocumentFragment returned by legendFormatter instead of stringifying it", () => {
    const { g, legend } = makeChart({
      tooltip: { show: "always" },
      legendFormatter: () => {
        const frag = document.createDocumentFragment();
        const span = document.createElement("span");
        span.className = "custom-node";
        span.textContent = "fragment";
        frag.appendChild(span);
        return frag;
      },
    });

    expect(legend.querySelector(".custom-node")).not.toBeNull();
    expect(legend.textContent).toBe("fragment");

    g.destroy();
  });

  it("leaves a series hidden by visibility out of the legend", () => {
    const { g, legend } = makeChart({
      tooltip: { show: "always" },
      visibility: [true, false],
    });

    expect(legend.textContent).toContain("A");
    expect(legend.textContent).not.toContain("B");
    expect(legend.querySelectorAll(".zpgraph-legend-line")).toHaveLength(1);

    g.destroy();
  });

  it("keeps a hidden series out of the selection legend too", () => {
    const { g, legend } = makeChart({
      tooltip: { show: "always" },
      visibility: [true, false],
    });

    g.setSelection(1);

    // 15 is A's value at row 1, 25 is B's.
    expect(legend.textContent).toContain("15");
    expect(legend.textContent).not.toContain("25");

    g.destroy();
  });

  it("positions the tooltip near the selection when position is 'follow'", () => {
    const { g, legend } = makeChart({ tooltip: { position: "follow" } });

    stubLayoutMetrics(legend, { width: 80, height: 24 });

    g.setSelection(1);

    expect(legend.style.left).not.toBe("");
    expect(legend.style.top).not.toBe("");
    expect(parseFloat(legend.style.left)).not.toBeNaN();
    expect(parseFloat(legend.style.top)).not.toBeNaN();

    g.destroy();
  });

  it("honors tooltip.position for fixed modes", () => {
    const { g, legend } = makeChart({
      tooltip: {
        show: "onmouseover",
        position: "top-left",
        offsetX: 8,
        offsetY: 2,
      },
    });
    stubLayoutMetrics(legend, { width: 80, height: 24 });
    g.setSelection(1);

    expect(parseFloat(legend.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(legend.style.top)).toBeGreaterThanOrEqual(0);
    const area = g.plotter_.area;
    expect(parseFloat(legend.style.left)).toBeCloseTo(area.x + 8, 0);

    g.destroy();
  });

  it("hides the div entirely when tooltip.show is 'never'", () => {
    const { g, legend } = makeChart({ tooltip: { show: "never" } });

    g.setSelection(1);
    expect(legend.style.display).toBe("none");

    g.destroy();
  });

  it("renders into a user-supplied labelsDiv and leaves the graph div alone", () => {
    const external = document.createElement("div");
    external.id = "external-legend";
    document.body.appendChild(external);

    const { el, g } = makeChart({
      tooltip: { show: "always" },
      labelsDiv: "external-legend",
    });

    expect(el.querySelector(".zpgraph-legend")).toBeNull();
    expect(external.textContent).toContain("A");

    g.destroy();
  });
});

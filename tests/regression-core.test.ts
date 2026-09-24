import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export-chart";
import ToolbarPlugin from "../src/plugins/toolbar";
import { applyLabelStyle } from "../src/class-names";
import { makeChart, mockCanvas, mountDiv, sampleData } from "./helpers";
import { Zpgraph } from "../src/index";

describe("core regressions", () => {
  it("destroy is idempotent", () => {
    mockCanvas();
    const g = makeChart();
    g.destroy();
    expect(() => g.destroy()).not.toThrow();
  });

  it("stackedGraphNaNFill none does not treat the string as true", () => {
    mockCanvas();
    const g = makeChart(
      [
        [1, 1, 2],
        [2, null, 3],
        [3, 1, 2],
      ],
      { stackedGraph: true, stackedGraphNaNFill: "none", labels: ["x", "A", "B"] },
    );
    const stacked = g.layout_.points.flat().find((p) => p.yval === null);
    expect(stacked?.yval_stacked === 0 || stacked?.yval_stacked == null).toBe(
      true,
    );
    g.destroy();
  });

  it("toDomXCoord follows a log x axis", () => {
    mockCanvas();
    const g = makeChart(
      [
        [1, 1],
        [10, 2],
        [100, 3],
      ],
      { labels: ["x", "A"], axes: { x: { logscale: true } } },
    );
    const a = g.toDomXCoord(1);
    const b = g.toDomXCoord(10);
    const c = g.toDomXCoord(100);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    const ab = (b ?? 0) - (a ?? 0);
    const bc = (c ?? 0) - (b ?? 0);
    expect(Math.abs(ab - bc)).toBeLessThan(1);
    g.destroy();
  });

  it("does not render the legacy roller input", () => {
    mockCanvas();
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    expect(g.graphDiv.querySelector("input.zpgraph-roller")).toBeNull();
    g.destroy();
  });

  it("restores options after leaving a responsive breakpoint", () => {
    mockCanvas();
    const g = makeChart(sampleData, {
      strokeWidth: 1,
      responsive: [{ breakpoint: 200, options: { strokeWidth: 4 } }],
    });
    g.resize(100, 320);
    expect(g.getNumericOption("strokeWidth")).toBe(4);
    g.resize(480, 320);
    expect(g.getNumericOption("strokeWidth")).toBe(1);
    g.destroy();
  });

  it("prefixes formula-looking CSV cells", () => {
    mockCanvas();
    const g = makeChart(
      [
        [1, 1],
        [2, 2],
      ],
      { labels: ["x", "=cmd"] },
    );
    const csv = toCsv(g, { utf8Bom: false });
    expect(csv.split("\n")[0]).toContain("'=cmd");
    g.destroy();
  });

  it("rejects url() in label styles", () => {
    const el = document.createElement("div");
    applyLabelStyle(el, "zpgraph-label", {
      style: { color: "red", backgroundImage: "url(https://evil.test/x)" },
    });
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundImage).toBe("");
  });

  it("keeps the toolbar node across redraws", () => {
    mockCanvas();
    const g = makeChart(sampleData, {
      plugins: [ToolbarPlugin],
      toolbar: true,
    });
    const first = g.graphDiv.querySelector(".zpgraph-toolbar");
    expect(first).toBeTruthy();
    g.updateOptions({ dateWindow: [1, 3] });
    const second = g.graphDiv.querySelector(".zpgraph-toolbar");
    expect(second).toBe(first);
    g.destroy();
  });
});

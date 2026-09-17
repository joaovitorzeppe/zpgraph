import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

describe("Zpgraph chart smoke", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("renders array data and exposes ranges", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      tooltip: { show: "always" },
    });

    expect(g.numRows()).toBe(4);
    expect(g.numColumns()).toBe(3);
    expect(g.getLabels()).toEqual(["x", "A", "B"]);
    const xr = g.xAxisRange();
    expect(xr[0]!).toBeLessThanOrEqual(1);
    expect(xr[1]!).toBeGreaterThanOrEqual(4);
    const yr = g.yAxisRange(0)!;
    expect(yr[0]!).toBeLessThanOrEqual(10);
    expect(yr[1]!).toBeGreaterThanOrEqual(28);

    g.updateOptions({ valueRange: [0, 50] });
    expect(g.yAxisRange(0)![0]).toBe(0);
    expect(g.yAxisRange(0)![1]).toBe(50);

    g.destroy();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  Zpgraph,
  safeCssClasses,
  withClassNames,
} from "../src/index";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

describe("classNames + CSS class sanitizer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("allows Tailwind-like utilities and rejects breakout chars", () => {
    expect(safeCssClasses("rounded-md text-xs md:text-sm")).toEqual([
      "rounded-md",
      "text-xs",
      "md:text-sm",
    ]);
    expect(safeCssClasses('foo"><script')).toEqual([]);
    expect(withClassNames("zpgraph-legend", "p-3 shadow-lg")).toBe(
      "zpgraph-legend p-3 shadow-lg",
    );
  });

  it("applies classNames.root on graphDiv", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      classNames: { root: "my-chart ring-1" },
    });

    expect(g.graphDiv.className).toContain("zpgraph");
    expect(g.graphDiv.className).toContain("my-chart");
    expect(g.graphDiv.className).toContain("ring-1");
    g.destroy();
  });

  it("applies classNames.legend on the generated legend", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      legend: "always",
      classNames: { legend: "rounded-md p-3" },
    });

    const legend = g.graphDiv.querySelector(".zpgraph-legend");
    expect(legend?.className).toContain("zpgraph-legend");
    expect(legend?.className).toContain("rounded-md");
    expect(legend?.className).toContain("p-3");
    g.destroy();
  });

  it("updates root classes via updateOptions", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });

    g.updateOptions({ classNames: { root: "themed" } });
    expect(g.graphDiv.className).toContain("themed");
    g.destroy();
  });
});

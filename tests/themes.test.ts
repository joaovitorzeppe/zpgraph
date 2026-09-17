import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph, themes } from "../src/index";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

describe("themes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("exports light and dark canvas chrome keys", () => {
    expect(themes.light.axisLineColor).toBe("black");
    expect(themes.dark.axisLineColor).toBe("#c0c0c0");
    expect(themes.dark.gridLineColor).toBeTruthy();
    expect(themes.light.highlightSeriesBackgroundColor).toBeTruthy();
  });

  it("sets data-theme on graphDiv when theme option is dark", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      theme: "dark",
    });

    expect(g.graphDiv.getAttribute("data-theme")).toBe("dark");
    expect(g.getOption("gridLineColor")).toBe(themes.dark.gridLineColor);
    g.destroy();
  });

  it("lets an explicit gridLineColor win over the theme preset", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      theme: "dark",
      gridLineColor: "rgb(255,0,0)",
    });

    expect(g.getOption("gridLineColor")).toBe("rgb(255,0,0)");
    g.destroy();
  });

  it("updates data-theme and chrome on updateOptions({ theme })", () => {
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      theme: "light",
    });

    g.updateOptions({ theme: "dark" });
    expect(g.graphDiv.getAttribute("data-theme")).toBe("dark");
    expect(g.getOption("axisLineColor")).toBe(themes.dark.axisLineColor);
    g.destroy();
  });
});

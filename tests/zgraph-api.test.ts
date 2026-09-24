import { describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";

describe("Zpgraph package surface", () => {
  it("exports constructor and version", () => {
    expect(typeof Zpgraph).toBe("function");
    expect(Zpgraph.VERSION).toBe("2.0.0");
    expect(Zpgraph.PLUGINS).toHaveLength(5);
    expect(Zpgraph.NAME).toBe("Zpgraph");
  });

  it("exposes plugins and data handlers", () => {
    expect(Zpgraph.Plugins.Legend).toBeTruthy();
    expect(Zpgraph.Plugins.Axes).toBeTruthy();
    expect(Zpgraph.DataHandlers.DefaultHandler).toBeTruthy();
    expect(Zpgraph.PLUGINS.length).toBeGreaterThan(0);
  });
});

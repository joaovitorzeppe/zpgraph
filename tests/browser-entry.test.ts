import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/style.css", () => ({ default: "/* zpgraph css */" }));

describe("browser entry", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    delete (globalThis as { Zpgraph?: unknown }).Zpgraph;
  });

  it("exports default and sets globalThis.Zpgraph", async () => {
    const mod = await import("../src/browser");

    expect(mod.default).toBeTruthy();
    expect(
      (globalThis as typeof globalThis & { Zpgraph?: unknown }).Zpgraph,
    ).toBe(mod.default);
    expect(document.getElementById("zpgraph-stylesheet")?.textContent).toBe(
      "/* zpgraph css */",
    );
  });
});

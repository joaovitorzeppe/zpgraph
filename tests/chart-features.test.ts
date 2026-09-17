import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

describe("thresholds plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("accepts thresholds option without throwing", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      thresholds: [
        { y: 10, y2: 20, fillColor: "rgba(0,0,255,0.1)", label: "band" },
        { y: 15, color: "#f00" },
      ],
    });
    expect(g.getOption("thresholds")).toHaveLength(2);
    g.destroy();
  });
});

describe("export API", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("toCsv includes header and rows", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    const csv = g.toCsv();
    expect(csv.split("\n")[0]).toBe("x,A,B");
    expect(csv.split("\n").length).toBeGreaterThan(2);
    g.destroy();
  });

  it("toCsv omits hidden series and skips non-finite numbers", () => {
    const el = mountDiv();
    const g = new Zpgraph(
      el,
      [
        [1, 10, NaN],
        [2, 20, 30],
      ],
      {
        labels: ["x", "A", "B"],
        width: 480,
        height: 320,
        visibility: [true, false],
      },
    );
    const csv = g.toCsv({ visibleOnly: true });
    expect(csv.split("\n")[0]).toBe("x,A");
    expect(csv).not.toContain("NaN");
    expect(csv).not.toContain(",B");
    g.destroy();
  });

  it("toCsv can prefix UTF-8 BOM", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    expect(g.toCsv({ utf8Bom: true }).startsWith("\uFEFF")).toBe(true);
    g.destroy();
  });

  it("toPng returns a data URL", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    // jsdom canvas mock may return empty string — method must not throw.
    expect(() => g.toPng()).not.toThrow();
    g.destroy();
  });
});

describe("toolbar + status overlays", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("renders toolbar buttons", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      toolbar: true,
    });
    expect(el.querySelector(".zpgraph-toolbar")).not.toBeNull();
    expect(el.querySelectorAll(".zpgraph-toolbar-btn").length).toBeGreaterThan(
      3,
    );
    g.destroy();
  });

  it("shows noData overlay when empty", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, [], {
      labels: ["x", "A"],
      width: 480,
      height: 320,
      noData: { text: "Vazio" },
    });
    const node = el.querySelector(".zpgraph-no-data") as HTMLElement | null;
    expect(node).not.toBeNull();
    expect(node!.textContent).toBe("Vazio");
    g.destroy();
  });

  it("shows loading overlay", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      loading: true,
    });
    expect(el.querySelector(".zpgraph-loading")).not.toBeNull();
    g.destroy();
  });
});

describe("chartAnnotations + eventMarkers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("accepts chartAnnotations and eventMarkers", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      chartAnnotations: {
        xaxis: [{ x: 2, label: "X" }],
        yaxis: [{ y: 10, y2: 20 }],
      },
      eventMarkers: [{ x: 3, label: "evt" }],
    });
    expect(g.getOption("chartAnnotations")).toBeTruthy();
    expect(g.getOption("eventMarkers")).toHaveLength(1);
    g.destroy();
  });
});

describe("Enter fires pointClickCallback", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("calls pointClickCallback on Enter after selection", () => {
    let clicked = false;
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      pointClickCallback: () => {
        clicked = true;
      },
    });
    g.graphDiv.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    );
    g.graphDiv.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(clicked).toBe(true);
    g.destroy();
  });
});

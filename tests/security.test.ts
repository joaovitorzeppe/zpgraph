import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import * as utils from "../src/utils";
import Legend from "../src/plugins/legend";
import { mockCanvas, mountDiv, sampleData } from "./helpers";

const XSS = '<img src=x onerror="globalThis.__xss = true">';

describe("option merging cannot reach the prototype chain", () => {
  afterEach(() => {
    // Any leak would poison every later test in the run.
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  it("updateDeep ignores __proto__ coming from parsed JSON", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": "yes"}}');
    utils.updateDeep({}, evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("update ignores __proto__ coming from parsed JSON", () => {
    const target: Record<string, unknown> = {};
    utils.update(target, JSON.parse('{"__proto__": {"polluted": "yes"}}'));
    expect(target.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
  });

  it("constructor and prototype keys are skipped too", () => {
    const target: Record<string, unknown> = {};
    utils.updateDeep(
      target,
      JSON.parse('{"constructor": {"x": 1}, "prototype": {"y": 2}, "keep": 3}'),
    );
    expect(target.keep).toBe(3);
    expect(target.constructor).toBe(Object);
  });

  it("a chart built from a polluting options object stays clean", () => {
    mockCanvas();
    const g = new Zpgraph(mountDiv(), sampleData, {
      ...JSON.parse('{"__proto__": {"polluted": "yes"}}'),
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    g.updateOptions(JSON.parse('{"__proto__": {"polluted": "yes"}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    g.destroy();
  });
});

describe("text options reach the DOM as text, not markup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__xss;
  });

  it("title, xlabel, ylabel and y2label are escaped", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      title: XSS,
      xlabel: XSS,
      ylabel: XSS,
      y2label: XSS,
      series: { B: { axis: "y2" } },
    });

    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".zpgraph-title")!.textContent).toBe(XSS);
    expect((globalThis as Record<string, unknown>).__xss).toBeUndefined();

    // Redraw takes the didDrawChart path, which updates the labels again.
    g.updateOptions({ title: XSS });
    expect(el.querySelector("img")).toBeNull();

    g.destroy();
  });

  it("axis tick labels are escaped", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
      axes: { x: { axisLabelFormatter: () => XSS } },
    });

    const label = el.querySelector(".zpgraph-axis-label-x");
    expect(label).not.toBeNull();
    expect(label!.querySelector("img")).toBeNull();
    expect(label!.textContent).toBe(XSS);

    g.destroy();
  });
});

describe("series colors cannot break out of the legend style attribute", () => {
  const graphWithColor = (color: string) => ({
    getLabels: () => ["x", "A"],
    getPropertiesForSeries: () => ({ color, visible: true, axis: 1 }),
    getOption: (name: string) =>
      name === "legend"
        ? "always"
        : name === "showLabelsOnHighlight"
          ? true
          : undefined,
    getHighlightSeries: () => null,
    numAxes: () => 1,
  });

  /** The built-in legend now comes back as nodes rather than as markup. */
  const legendSpan = (color: string) => {
    const fragment = Legend.generateLegendHTML(
      graphWithColor(color) as unknown as Parameters<
        typeof Legend.generateLegendHTML
      >[0],
      undefined,
      undefined,
      10,
      null,
    ) as DocumentFragment;
    const host = document.createElement("div");
    host.appendChild(fragment);
    return host.querySelector("span")!;
  };

  it("a color carrying a quote and a declaration is rejected", () => {
    const span = legendSpan("red; background: url('javascript:1')");
    expect(span).not.toBe(null);
    expect(span.getAttribute("style")).not.toContain("javascript:");
    expect(span.style.background).toBe("");
  });

  it("ordinary colors survive untouched", () => {
    for (const color of ["#ff0000", "rgb(1, 2, 3)", "rebeccapurple"]) {
      expect(legendSpan(color).style.color).not.toBe("");
    }
  });

  // The whole point of building nodes: a strict style-src blocks a style
  // attribute the parser read out of markup, but not one set through the CSSOM.
  it("the built-in legend asks the parser to read no markup at all", () => {
    const fragment = Legend.generateLegendHTML(
      graphWithColor("#ff0000") as unknown as Parameters<
        typeof Legend.generateLegendHTML
      >[0],
      undefined,
      undefined,
      10,
      null,
    );
    expect(fragment).toBeInstanceOf(DocumentFragment);
  });
});

describe("annotation attributes are validated before hitting the DOM", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  const renderAnnotation = (annotation: Record<string, unknown>) => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    g.setAnnotations([{ series: "A", x: 2, shortText: "a", ...annotation }]);
    return { el, g };
  };

  // setAnnotations requires explicit dimensions alongside an icon.
  const icon = { width: 16, height: 16 };

  it("drops an icon URL with a non-fetchable scheme", () => {
    const { el, g } = renderAnnotation({
      ...icon,
      icon: "javascript:alert(1)",
    });
    const node = el.querySelector(".zpgraph-annotation");
    expect(node).not.toBeNull();
    expect(node!.querySelector("img")).toBeNull();
    // Falls back to the default text annotation instead of an empty box.
    expect(node!.className).toContain("zpgraph-default-annotation");
    g.destroy();
  });

  it("keeps an ordinary icon URL", () => {
    const { el, g } = renderAnnotation({
      ...icon,
      icon: "https://example.test/i.png",
    });
    const img = el.querySelector(".zpgraph-annotation img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.test/i.png");
    g.destroy();
  });

  it("drops cssClass tokens that are not plain class names", () => {
    const { el, g } = renderAnnotation({ cssClass: 'ok-one "><script> bad!' });
    const node = el.querySelector(".zpgraph-annotation")!;
    expect(node.classList.contains("ok-one")).toBe(true);
    expect(node.classList.contains("bad!")).toBe(true); // Tailwind !important ok
    expect(el.querySelector("script")).toBeNull();
    expect(node.className).not.toContain("<");
    expect(node.className).not.toContain('"');
    g.destroy();
  });

  it("shortText is rendered as text", () => {
    const { el, g } = renderAnnotation({ shortText: XSS });
    const node = el.querySelector(".zpgraph-annotation")!;
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toBe(XSS);
    g.destroy();
  });
});

describe("legendFormatter return contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("a DocumentFragment is mounted without innerHTML", () => {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode("safe"));
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      legend: "always",
      legendFormatter: () => frag,
    });
    const legend = el.querySelector(".zpgraph-legend")!;
    expect(legend.textContent).toContain("safe");
    expect(legend.querySelector("img")).toBeNull();
    g.destroy();
  });

  it("a string is trusted app HTML (innerHTML path, not XSS-safe by itself)", () => {
    const el = mountDiv();
    const g = new Zpgraph(el, sampleData, {
      labels: ["x", "A", "B"],
      legend: "always",
      legendFormatter: () => '<span class="from-app">ok</span>',
    });
    const legend = el.querySelector(".zpgraph-legend")!;
    expect(legend.querySelector(".from-app")).not.toBeNull();
    g.destroy();
  });
});

describe("errors thrown by the public API are Error instances", () => {
  it("an unknown axis throws an Error, not a string", () => {
    mockCanvas();
    const g = new Zpgraph(mountDiv(), sampleData, {
      labels: ["x", "A", "B"],
      width: 480,
      height: 320,
    });
    expect(() => g.getOptionForAxis("drawAxis", "y9")).toThrow(Error);
    g.destroy();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Zpgraph } from "../src/index";
import Hairlines from "../src/extras/hairlines";
import SuperAnnotations from "../src/extras/super-annotations";
import { mockCanvas, mountDiv, sampleData, stubLayoutMetrics } from "./helpers";

/**
 * Both plugins were rewritten off jQuery in Wave 5. These cover what the
 * rewrite had to preserve: the divs land on the chart, the public get/set
 * round-trips, deletion cleans up, and events still reach listeners — now
 * through addEventListener rather than jQuery's bus.
 */

const makeChart = (plugin: unknown) =>
  new Zpgraph(mountDiv(), sampleData, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    plugins: [plugin as import("../src/types").Plugin],
  }) as unknown as Record<string, any>;

const pointer = (type: string, clientX: number, clientY = 0) =>
  Object.assign(
    new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 }),
    { pointerId: 1 },
  );

describe("Hairlines plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("adds a line and an info div to the chart", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, interpolated: true, selected: false }]);

    expect(g.graphDiv.querySelectorAll(".zpgraph-hairline").length).toBe(1);
    expect(plugin.get()).toEqual([
      { xval: 2, interpolated: true, selected: false },
    ]);

    g.destroy();
  });

  it("announces changes through addEventListener", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);
    const heard = vi.fn();
    plugin.addEventListener("hairlinesChanged", heard);

    plugin.set([{ xval: 2, interpolated: true, selected: false }]);

    expect(heard).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it("removes the divs of a hairline that is dropped", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);

    plugin.set([
      { xval: 2, interpolated: true, selected: false },
      { xval: 3, interpolated: true, selected: false },
    ]);
    expect(g.graphDiv.querySelectorAll(".zpgraph-hairline").length).toBe(2);

    plugin.set([{ xval: 2, interpolated: true, selected: false }]);

    expect(g.graphDiv.querySelectorAll(".zpgraph-hairline").length).toBe(1);
    expect(plugin.get().length).toBe(1);
    g.destroy();
  });

  it("marks the selected hairline with a class", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, interpolated: true, selected: true }]);

    expect(g.graphDiv.querySelector(".zpgraph-hairline.selected")).not.toBe(
      null,
    );
    g.destroy();
  });

  const sendPointer = (
    el: HTMLElement,
    type: string,
    clientX: number,
    clientY = 0,
  ) => {
    el.dispatchEvent(pointer(type, clientX, clientY));
  };

  it("updates xval when a hairline is dragged", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, interpolated: true, selected: false }]);

    const hairline = g.graphDiv.querySelector(
      ".zpgraph-hairline",
    ) as HTMLElement;
    const area = g.getArea();
    stubLayoutMetrics(g.graphDiv, {
      width: area.w + area.x * 2,
      height: area.h + area.y * 2,
    });

    const startLeft = parseFloat(hairline.style.left);
    const startX = startLeft + 3;
    const initialXval = plugin.get()[0]!.xval;

    sendPointer(hairline, "pointerdown", startX, area.y + 10);
    sendPointer(hairline, "pointermove", startX + 80, area.y + 10);
    sendPointer(hairline, "pointerup", startX + 80, area.y + 10);

    expect(plugin.get()[0]!.xval).not.toBe(initialXval);

    g.destroy();
  });

  it("fills the legend of a hairline with text, not markup", () => {
    const plugin = new Hairlines();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, interpolated: true, selected: false }]);

    const legend = g.graphDiv.querySelector(".hairline-legend");
    expect(legend).not.toBe(null);
    expect(legend!.textContent).toContain("A");
    g.destroy();
  });
});

describe("SuperAnnotations plugin", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
    const template = document.createElement("div");
    template.id = "annotation-template";
    template.innerHTML =
      '<span class="annotation-text">{{text}}</span>' +
      '<button class="annotation-kill-button">x</button>';
    document.body.appendChild(template);
  });

  it("adds a line and an info div to the chart", () => {
    const plugin = new SuperAnnotations();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, series: "A", text: "Launch" }]);

    expect(g.graphDiv.querySelectorAll(".zpgraph-annotation-line").length).toBe(
      1,
    );
    expect(g.graphDiv.textContent).toContain("Launch");
    g.destroy();
  });

  it("shows annotation text that contains markup as text", () => {
    const plugin = new SuperAnnotations();
    const g = makeChart(plugin);

    plugin.set([
      { xval: 2, series: "A", text: '<img src=x onerror="alert(1)">' },
    ]);

    expect(g.graphDiv.querySelector("img")).toBe(null);
    expect(g.graphDiv.textContent).toContain("<img src=x");
    g.destroy();
  });

  it("deletes an annotation when its kill button is clicked", () => {
    const plugin = new SuperAnnotations();
    const g = makeChart(plugin);
    const deleted = vi.fn();
    plugin.addEventListener("annotationDeleted", deleted);

    plugin.set([{ xval: 2, series: "A", text: "Launch" }]);
    const kill = g.graphDiv.querySelector(
      ".annotation-kill-button",
    ) as HTMLElement;
    kill.click();

    expect(deleted).toHaveBeenCalledTimes(1);
    expect(plugin.get().length).toBe(0);
    expect(g.graphDiv.querySelectorAll(".zpgraph-annotation-line").length).toBe(
      0,
    );
    g.destroy();
  });

  it("round-trips through get without exposing the divs", () => {
    const plugin = new SuperAnnotations();
    const g = makeChart(plugin);

    plugin.set([{ xval: 2, series: "A", text: "Launch" }]);

    const [a] = plugin.get();
    expect(a).toMatchObject({ xval: 2, series: "A", text: "Launch" });
    expect(a.infoDiv).toBe(undefined);
    expect(a.lineDiv).toBe(undefined);
    expect(a.stopDrag).toBe(undefined);
    g.destroy();
  });
});

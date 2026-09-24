import { beforeEach, describe, expect, it, vi } from "vitest";
import Crosshair from "../src/extras/crosshair";
import { createFillBetweenPlotter } from "../src/extras/fill-between";
import Hairlines from "../src/extras/hairlines";
import Keyboard from "../src/extras/keyboard";
import Rebase, { RebaseHandler } from "../src/extras/rebase";
import { synchronize } from "../src/extras/synchronizer";
import Unzoom from "../src/extras/unzoom";
import UrlSync from "../src/extras/url-sync";
import type { PlotterEvent, Point } from "../src/types";
import {
  makeChart,
  mockCanvas,
  recordingCanvas,
  sampleData,
} from "./helpers";

const userDraw = () => undefined;
const userHighlight = () => undefined;
const rebaseLabel = (y: number | Date) =>
  `L${typeof y === "number" ? y : y.getTime()}`;
const rebaseValue = (y: number) => `V${y}`;

const drawPoint = (
  canvasx: number,
  canvasy: number,
  yval: number | null,
): Point => ({
  idx: 0,
  name: "A",
  canvasx,
  canvasy,
  yval,
  xval: canvasx,
});

describe("extras regressions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
    history.replaceState(null, "", "/");
  });

  it("does not wipe callbacks before ready and does not resync a full range", () => {
    const g1 = makeChart(sampleData, {
      drawCallback: userDraw,
      highlightCallback: userHighlight,
    });
    const g2 = makeChart(sampleData, {
      drawCallback: userDraw,
      highlightCallback: userHighlight,
    });
    g1.is_initial_draw_ = true;
    g2.is_initial_draw_ = true;
    const pending = synchronize(g1, g2);
    const spy1 = vi.spyOn(g1, "updateOptions");
    const spy2 = vi.spyOn(g2, "updateOptions");
    pending.detach();
    expect(spy1).not.toHaveBeenCalled();
    expect(spy2).not.toHaveBeenCalled();
    expect(g1.getOption("drawCallback")).toBe(userDraw);
    expect(g1.getOption("highlightCallback")).toBe(userHighlight);
    g1.is_initial_draw_ = false;
    g2.is_initial_draw_ = false;

    const live1 = makeChart(sampleData, { drawCallback: userDraw });
    const live2 = makeChart(sampleData, { drawCallback: userDraw });
    const sync = synchronize(live1, live2, { selection: false });
    sync.detach();
    expect(live1.getOption("drawCallback")).toBe(userDraw);
    const again = synchronize(live1, live2, { selection: false });
    again.detach();
    expect(live1.getOption("drawCallback")).toBe(userDraw);

    const peer = makeChart();
    const source = makeChart();
    const zoomSync = synchronize(source, peer, {
      zoom: true,
      selection: false,
    });
    const peerUpdates = vi.spyOn(peer, "updateOptions");
    source.updateOptions({ strokeWidth: 2.5 });
    const dateWindowWrites = peerUpdates.mock.calls.filter((call) => {
      const attrs: unknown = call[0];
      return (
        typeof attrs === "object" &&
        attrs !== null &&
        Object.hasOwn(attrs, "dateWindow")
      );
    });
    expect(dateWindowWrites).toHaveLength(0);
    zoomSync.detach();
    g1.destroy();
    g2.destroy();
    live1.destroy();
    live2.destroy();
    source.destroy();
    peer.destroy();
  });

  it("restores an empty zoomCallback and clamps URL dates", () => {
    const sync = new UrlSync();
    const g = makeChart(sampleData, { plugins: [sync] });
    sync.destroy();
    history.replaceState(null, "", "/");
    const ext = g.xAxisExtremes();
    const mid = (ext[0] + ext[1]) / 2;
    g.doZoomXDates_(mid - 1, mid + 1);
    expect(location.search.includes("from=")).toBe(false);

    history.replaceState(null, "", "/?from=2&to=1e308");
    const clamped = makeChart(sampleData, { plugins: [new UrlSync()] });
    const dw = clamped.getOption("dateWindow");
    expect(Array.isArray(dw)).toBe(true);
    if (Array.isArray(dw)) {
      expect(dw[0]).toBeCloseTo(2, 5);
      expect(typeof dw[1] === "number" && dw[1] < 1e6).toBe(true);
    }

    history.replaceState(null, "", "/?from=NaN&to=3");
    const rejected = makeChart(sampleData, { plugins: [new UrlSync()] });
    expect(rejected.getOption("dateWindow") == null).toBe(true);
    g.destroy();
    clamped.destroy();
    rejected.destroy();
  });

  it("clears the hairline click timer on destroy", () => {
    vi.useFakeTimers();
    try {
      const plugin = new Hairlines();
      const g = makeChart(sampleData, { plugins: [plugin] });
      plugin.click({ canvasx: 40 });
      plugin.destroy();
      vi.advanceTimersByTime(500);
      expect(plugin.get()).toHaveLength(0);
      g.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the crosshair canvas and defaults to vertical", () => {
    const plugin = new Crosshair();
    expect(plugin.direction_).toBe("vertical");
    const g = makeChart(sampleData, { plugins: [plugin] });
    const canvas = plugin.canvas_;
    expect(canvas).not.toBeNull();
    expect(canvas !== null && g.graphDiv.contains(canvas)).toBe(true);
    plugin.destroy();
    expect(canvas !== null && g.graphDiv.contains(canvas)).toBe(false);
    g.destroy();
  });

  it("skips a zero rebase base and restores formatters", () => {
    expect(RebaseHandler.rebase(10, 0, "percent")).toBeNull();
    expect(RebaseHandler.rebase(10, null, 100)).toBeNull();
    expect(
      RebaseHandler.rebase(10, Number.POSITIVE_INFINITY, "percent"),
    ).toBeNull();

    const handler = new RebaseHandler("percent");
    const skipped = handler.seriesToPoints(
      [
        [1, 0],
        [2, 10],
      ],
      "A",
      0,
    );
    expect(skipped[0]?.yval).toBeNull();
    expect(skipped[1]?.yval).toBeNull();

    const plugin = new Rebase("percent");
    const g = makeChart(sampleData, {
      plugins: [plugin],
      axes: {
        y: {
          axisLabelFormatter: rebaseLabel,
          valueFormatter: rebaseValue,
        },
      },
    });
    const stamped = g.getOptionForAxis("axisLabelFormatter", "y");
    expect(stamped).not.toBe(rebaseLabel);
    g.updateOptions({ rollPeriod: 1 });
    expect(g.getOptionForAxis("axisLabelFormatter", "y")).toBe(stamped);
    expect(g.dataHandler_).toBeInstanceOf(RebaseHandler);
    plugin.destroy();
    expect(g.getOptionForAxis("axisLabelFormatter", "y")).toBe(rebaseLabel);
    expect(g.getOptionForAxis("valueFormatter", "y")).toBe(rebaseValue);
    expect(g.dataHandler_).not.toBeInstanceOf(RebaseHandler);
    g.destroy();
  });

  it("moves the unzoom button when the plot area changes", () => {
    const plugin = new Unzoom();
    const g = makeChart(sampleData, { plugins: [plugin] });
    const button = g.graphDiv.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("expected reset button");
    }
    g.plotter_.area.x = 80;
    g.plotter_.area.y = 60;
    plugin.willDrawChart({
      zpgraph: g,
      canvas: g.hidden_,
      drawingContext: g.hidden_ctx_,
      cancelable: false,
      defaultPrevented: false,
      preventDefault: () => undefined,
      propagationStopped: false,
      stopPropagation: () => undefined,
    });
    expect(button.style.left).toBe("84px");
    expect(button.style.top).toBe("64px");
    g.destroy();
  });

  it("restarts the fill after a non-finite y", () => {
    const rec = recordingCanvas();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) {
      throw new Error("missing 2d context");
    }
    const event: PlotterEvent = {
      points: [],
      setName: "A",
      drawingContext: ctx,
      color: "#000",
      strokeWidth: 1,
      zpgraph: null,
      axis: null,
      plotArea: { x: 0, y: 0, w: 10, h: 10 },
      seriesIndex: 0,
      seriesCount: 2,
      setNames: ["A", "B"],
    };
    Reflect.set(event, "allSeriesPoints", [
      [
        drawPoint(0, 10, 1),
        drawPoint(10, 10, Number.NaN),
        drawPoint(20, 10, 1),
      ],
      [drawPoint(0, 30, 2), drawPoint(10, 30, 2), drawPoint(20, 30, 2)],
    ]);
    createFillBetweenPlotter({ seriesA: "A", seriesB: "B" })(event);
    const ops = rec.calls
      .filter((call) => call.op === "moveTo" || call.op === "lineTo")
      .map((call) => `${call.op}:${String(call.args[0])},${String(call.args[1])}`);
    expect(ops).toContain("moveTo:20,10");
    expect(ops).not.toContain("lineTo:20,10");
  });

  it("does not cancel keyboard keys that leave the view unchanged", () => {
    const kb = new Keyboard();
    const g = makeChart(sampleData, { plugins: [kb] });
    const right = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      cancelable: true,
    });
    const prevent = vi.spyOn(right, "preventDefault");
    const stop = vi.spyOn(right, "stopPropagation");
    kb.onKey_(right);
    expect(prevent).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();

    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    const preventEsc = vi.spyOn(esc, "preventDefault");
    kb.onKey_(esc);
    expect(preventEsc).not.toHaveBeenCalled();

    g.updateOptions({ dateWindow: [2, 3] });
    const zoomedEsc = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    const preventZoomed = vi.spyOn(zoomedEsc, "preventDefault");
    kb.onKey_(zoomedEsc);
    expect(preventZoomed).toHaveBeenCalled();
    expect(g.isZoomed()).toBe(false);
    g.destroy();
  });
});

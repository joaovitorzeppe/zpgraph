import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import ZpgraphLayout from "../src/layout";
import type { ZpgraphOptions } from "../src/types";
import { mockCanvas, mountDiv } from "./helpers";

const chartFromCsv = (csv: string, opts: Partial<ZpgraphOptions> = {}) =>
  new Zpgraph(mountDiv(), csv, {
    width: 480,
    height: 320,
    ...opts,
  });

describe("CSV parser regressions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("strips a UTF-8 BOM before reading labels", () => {
    const g = chartFromCsv("\uFEFFX,A\n1,2\n");
    expect(g.getLabels()).toEqual(["X", "A"]);
    expect(g.rawData_[0]).toEqual([1, 2]);
    g.destroy();
  });

  it("parses quoted fields, escaped quotes, and CRLF inside quotes", () => {
    const g = chartFromCsv(
      'X,"A, B","say ""hi"""\r\n1,"2,5",3\r\n4,"5\r\n6",7\r\n',
    );
    expect(g.getLabels()).toEqual(["X", "A, B", 'say "hi"']);
    expect(g.rawData_).toEqual([
      [1, 2, 3],
      [4, 5, 7],
    ]);
    g.destroy();
  });

  it("keeps the fast path for CSV without quotes", () => {
    const g = chartFromCsv("X,A\n1,2\n3,4\n");
    expect(g.rawData_).toEqual([
      [1, 2],
      [3, 4],
    ]);
    g.destroy();
  });

  it("fills a malformed customBars cell with nulls", () => {
    const g = chartFromCsv("X,A\n1,1;2\n", { customBars: true });
    expect(g.rawData_[0]?.[1]).toEqual([null, null, null]);
    g.destroy();
  });
});

const loggedValues = (run: () => void): number[] => {
  const seen: number[] = [];
  const original = Math.log;
  Math.log = (value: number) => {
    seen.push(value);
    return original(value);
  };
  try {
    run();
  } finally {
    Math.log = original;
  }
  return seen;
};

const evaluateLogLayout = (
  xRange: [number, number],
  yRange: [number, number],
) => {
  const fake = {
    xAxisRange: () => xRange,
    getOption: (name: string) => name === "logscale",
    getOptionForAxis: (name: string) => name === "logscale",
  };
  const layout = Reflect.construct(ZpgraphLayout, [fake]);
  layout.yAxes_ = [{ computedValueRange: yRange, logscale: true }];
  layout._evaluateLimits();
  return layout;
};

describe("log scale layout regressions", () => {
  it("does not call Math.log on a non-positive extreme", () => {
    const seen = loggedValues(() => {
      const layout = evaluateLogLayout([-2, 10], [-5, 20]);
      expect(layout._xAxis.minval).toBeGreaterThan(0);
      expect(layout.yAxes_[0].minyval).toBeGreaterThan(0);
      expect(Number.isFinite(layout._xAxis.xlogscale)).toBe(true);
      expect(Number.isFinite(layout.yAxes_[0].ylogscale)).toBe(true);
    });
    expect(seen.every((value) => value > 0)).toBe(true);
  });

  it("skips log when both extremes are non-positive", () => {
    const seen = loggedValues(() => {
      const layout = evaluateLogLayout([-8, -2], [-4, -1]);
      expect(layout.yAxes_[0].ylogrange).toBeNaN();
      expect(layout.yAxes_[0].ylogscale).toBe(1);
      expect(layout._xAxis.xlogscale).toBe(1);
    });
    expect(seen.every((value) => value > 0)).toBe(true);
  });

  it("keeps a normal positive log range", () => {
    const layout = evaluateLogLayout([1, 100], [1, 100]);
    expect(layout.yAxes_[0].minyval).toBe(1);
    expect(layout.yAxes_[0].maxyval).toBe(100);
    expect(layout.yAxes_[0].ylogscale).toBeCloseTo(0.5, 10);
  });
});

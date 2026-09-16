import { beforeEach, describe, expect, it } from "vitest";
import { Zpgraph } from "../src/index";
import {
  DECIMATION_THRESHOLD,
  decimatePointsByX,
  type DecimatedPoints,
} from "../src/decimate";
import type { Point } from "../src/types";
import { mockCanvas, mountDiv } from "./helpers";

const makePoints = (
  count: number,
  yFn: (i: number) => number | null = (i) => Math.sin(i * 0.01) * 100,
): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      idx: i,
      name: "A",
      xval: i,
      yval: yFn(i),
    });
  }
  return points;
};

describe("decimatePointsByX", () => {
  it("returns the original array when the series is sparse enough", () => {
    const points = makePoints(100);
    const result = decimatePointsByX(points, 0, 99, 100);
    expect(result).toBe(points);
    expect((result as DecimatedPoints)._decimated).toBeUndefined();
  });

  it("reduces dense series to roughly pixelWidth * threshold points", () => {
    const points = makePoints(10000);
    const pixelWidth = 100;
    const result = decimatePointsByX(points, 0, 9999, pixelWidth);

    expect(result.length).toBeLessThan(10000);
    expect(result.length).toBeGreaterThanOrEqual(pixelWidth);
    expect(result.length).toBeLessThanOrEqual(
      pixelWidth * DECIMATION_THRESHOLD + pixelWidth,
    );
    expect((result as DecimatedPoints)._decimated).toBe(true);
  });

  it("preserves gaps in the decimated output", () => {
    const points = makePoints(10000, (i) => (i % 500 === 0 ? null : i % 100));
    const result = decimatePointsByX(points, 0, 9999, 100);
    const gaps = result.filter((p) => p.yval === null);
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(points[gap.idx]!.yval).toBeNull();
    }
  });

  it("keeps first, min, max and last per column", () => {
    const points: Point[] = [];
    for (let col = 0; col < 10; col++) {
      const base = col * 10;
      points.push({ idx: base, name: "A", xval: base, yval: 5 });
      points.push({ idx: base + 1, name: "A", xval: base + 1, yval: 1 });
      points.push({ idx: base + 2, name: "A", xval: base + 2, yval: 9 });
      points.push({ idx: base + 3, name: "A", xval: base + 3, yval: 7 });
    }
    const result = decimatePointsByX(points, 0, 99, 10, 1);
    const idxs = new Set(result.map((p) => p.idx));
    expect(idxs.has(0)).toBe(true);
    expect(idxs.has(1)).toBe(true);
    expect(idxs.has(2)).toBe(true);
    expect(idxs.has(3)).toBe(true);
  });

  it("returns the original array for invalid span or width", () => {
    const points = makePoints(10000);
    expect(decimatePointsByX(points, 0, 0, 100)).toBe(points);
    expect(decimatePointsByX(points, 0, 9999, 0)).toBe(points);
  });

  it("emits points sorted by xval", () => {
    const points = makePoints(5000);
    const result = decimatePointsByX(points, 0, 4999, 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.xval!).toBeGreaterThanOrEqual(result[i - 1]!.xval!);
    }
  });
});

describe("selection with decimated data", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockCanvas();
  });

  it("setSelection and getSelection use Point.idx after draw with dateWindow", () => {
    const data: Array<[number, number]> = [];
    for (let i = 0; i < 10000; i++) {
      data.push([i, Math.sin(i * 0.01) * 100]);
    }

    const g = new Zpgraph(mountDiv(), data, {
      labels: ["x", "A"],
      width: 480,
      height: 320,
      dateWindow: [2000, 8000],
    }) as unknown as Record<string, any>;

    const layoutPoints = g.layout_.points[0]!;
    expect(layoutPoints.length).toBeLessThan(8000);

    const targetRow = layoutPoints[Math.floor(layoutPoints.length / 2)]!.idx;
    g.setSelection(targetRow, undefined, undefined, true);
    expect(g.getSelection()).toBe(targetRow);

    expect(g.rawData_.length).toBe(10000);
    expect(g.boundaryIds_[0]![0]).toBeLessThanOrEqual(2000);
    expect(g.boundaryIds_[0]![1]).toBeGreaterThanOrEqual(8000);

    g.destroy();
  });

  it("findClosestRow returns a surviving idx near the requested x", () => {
    const data: Array<[number, number]> = [];
    for (let i = 0; i < 10000; i++) {
      data.push([i, i]);
    }

    const g = new Zpgraph(mountDiv(), data, {
      labels: ["x", "A"],
      width: 480,
      height: 320,
      dateWindow: [1000, 9000],
    }) as unknown as Record<string, any>;

    const domX = g.toDomXCoord(5000);
    const closest = g.findClosestRow(domX);
    expect(
      g.layout_.points[0]!.some((p: { idx?: number }) => p.idx === closest),
    ).toBe(true);
    expect(Math.abs(closest - 5000)).toBeLessThan(100);

    g.destroy();
  });
});

import { describe, expect, it } from "vitest";
import {
  dateTicker,
  Granularity,
  numericTicks,
  pickDateTickGranularity,
} from "../src/tickers";

const opts = (name: string) => {
  if (name === "pixelsPerLabel") {
    return 30;
  }
  if (name === "axisTickSize") {
    return 3;
  }
  if (name === "axisLabelFormatter") {
    return (v: number) => String(v);
  }
  return null;
};

describe("tickers", () => {
  it("numericTicks returns ticks in range", () => {
    const ticks = Reflect.apply(numericTicks, undefined, [
      0,
      100,
      300,
      opts,
      null,
      null,
    ]);
    if (!Array.isArray(ticks) || ticks.length < 2) {
      throw new Error("expected ticks array");
    }
    const first = ticks[0];
    const last = ticks[ticks.length - 1];
    if (
      !first ||
      typeof first !== "object" ||
      !("v" in first) ||
      !last ||
      typeof last !== "object" ||
      !("v" in last)
    ) {
      throw new Error("expected tick values");
    }
    expect(Number(first.v)).toBeGreaterThanOrEqual(0);
    expect(Number(last.v)).toBeLessThanOrEqual(100);
  });

  it("returns one finite tick when the numeric span is zero", () => {
    const ticks = numericTicks(5, 5, 300, opts, null);
    expect(ticks).toEqual([{ v: 5, label: "5" }]);
  });

  it("returns no NaN ticks when the numeric range is not finite", () => {
    expect(numericTicks(Number.NaN, 10, 300, opts, null)).toEqual([]);
    expect(numericTicks(4, Number.POSITIVE_INFINITY, 300, opts, null)).toEqual([
      { v: 4, label: "4" },
    ]);
  });

  it("does not build log ticks from a non-positive bound", () => {
    const logOpts = (name: string) =>
      name === "logscale" ? true : opts(name);
    const ticks = numericTicks(-5, 10, 300, logOpts, null);
    expect(ticks).toEqual([{ v: -5, label: "-5" }]);
    expect(ticks.every((tick) => Number.isFinite(tick.v))).toBe(true);

    const positive = numericTicks(1, 100, 300, logOpts, null);
    expect(positive.length).toBeGreaterThan(1);
    expect(positive.every((tick) => Number.isFinite(tick.v) && tick.v > 0)).toBe(
      true,
    );
  });

  it("pickDateTickGranularity returns a granularity", () => {
    const g = pickDateTickGranularity(
      Date.UTC(2020, 0, 1),
      Date.UTC(2020, 0, 10),
      400,
      opts,
    );
    expect(typeof g).toBe("number");
    expect(g).toBeGreaterThanOrEqual(Granularity.MILLISECONDLY);
  });

  it("does not use the finest date grain when the span is not positive", () => {
    expect(pickDateTickGranularity(1000, 1000, 400, opts)).toBe(-1);
    expect(pickDateTickGranularity(2000, 1000, 400, opts)).toBe(-1);
    expect(pickDateTickGranularity(Number.NaN, 1000, 400, opts)).toBe(-1);

    const same = dateTicker(1000, 1000, 400, opts, null);
    expect(same).toHaveLength(1);
    expect(same[0]?.v).toBe(1000);
    expect(dateTicker(2000, 1000, 400, opts, null)).toEqual([]);
  });
});

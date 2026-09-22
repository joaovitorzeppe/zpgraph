import { describe, expect, it } from "vitest";
import {
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
});

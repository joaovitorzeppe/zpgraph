import { describe, expect, it } from "vitest";
import {
  axisIndexFromName,
  axisNameFromIndex,
  defaultAxisSide,
  isAxisName,
  isYAxisName,
} from "../src/axis-ids";

describe("axis-ids", () => {
  it("maps names and indices both ways", () => {
    expect(axisNameFromIndex(0)).toBe("y");
    expect(axisNameFromIndex(1)).toBe("y2");
    expect(axisNameFromIndex(2)).toBe("y3");
    expect(axisIndexFromName("y")).toBe(0);
    expect(axisIndexFromName("y1")).toBe(0);
    expect(axisIndexFromName("Y2")).toBe(1);
    expect(axisIndexFromName("y3")).toBe(2);
    expect(axisIndexFromName(2)).toBe(2);
  });

  it("defaults side left / right / left", () => {
    expect(defaultAxisSide(0)).toBe("left");
    expect(defaultAxisSide(1)).toBe("right");
    expect(defaultAxisSide(2)).toBe("left");
  });

  it("validates axis name strings", () => {
    expect(isAxisName("x")).toBe(true);
    expect(isYAxisName("y3")).toBe(true);
    expect(isYAxisName("nope")).toBe(false);
    expect(() => axisIndexFromName("z")).toThrow(/Unknown axis/);
  });
});

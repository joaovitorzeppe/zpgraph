import { describe, expect, it } from "vitest";
import {
  binarySearch,
  clone,
  dateParser,
  floatFormat,
  hsvToRGB,
  isOK,
  isValidPoint,
  numberValueFormatter,
  parseFloat_,
  update,
  updateDeep,
  zeropad,
} from "../src/utils";

const handlerFn = () => 42;

const numberFormatterOpts = (name: string) => {
  if (name === "digitsAfterDecimal") {
    return 2;
  }
  if (name === "maxNumberWidth") {
    return 6;
  }
  if (name === "sigFigs") {
    return null;
  }
  if (name === "labelsKMG2") {
    return false;
  }
  return null;
};

describe("utils", () => {
  it("isOK rejects null, zero and NaN (dygraphs semantics)", () => {
    expect(isOK(1.5)).toBe(true);
    expect(isOK(0)).toBe(false);
    expect(isOK(null)).toBe(false);
    expect(isOK(NaN)).toBe(false);
  });

  it("isValidPoint checks scaled coords", () => {
    expect(isValidPoint({ x: 0.5, y: 0.5, xval: 1, yval: 2 })).toBe(true);
    expect(isValidPoint({ x: null, y: 0.5, xval: 1, yval: 2 })).toBe(false);
  });

  it("floatFormat and zeropad", () => {
    expect(zeropad(3)).toBe("03");
    expect(floatFormat(1234.5, 3)).toMatch(/1\.23e\+3|1230/);
  });

  it("hsvToRGB returns rgb string", () => {
    expect(hsvToRGB(0, 1, 1)).toBe("rgb(255,0,0)");
  });

  it("update / updateDeep / clone", () => {
    const a = { x: 1, nested: { y: 2 } };
    update(a, { x: 3 });
    expect(a.x).toBe(3);
    updateDeep(a, { nested: { y: 9, z: 1 } });
    expect(a.nested).toEqual({ y: 9, z: 1 });
    expect(clone([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("updateDeep keeps untouched keys, functions and DOM nodes", () => {
    const node = document.createElement("div");
    const self: Record<string, unknown> = {
      keep: "old",
      nested: { a: 1 },
    };
    updateDeep(self, {
      nested: { b: 2 },
      handler: handlerFn,
      labelsDiv: node,
    });
    expect(self.keep).toBe("old");
    expect(self.nested).toEqual({ a: 1, b: 2 });
    expect(self.handler).toBe(handlerFn);
    expect(self.labelsDiv).toBe(node);
  });

  it("binarySearch finds value", () => {
    const arr = [1, 3, 5, 7, 9];
    expect(binarySearch(5, arr)).toBe(2);
    expect(binarySearch(4, arr)).toBeLessThan(0);
  });

  it("dateParser accepts ISO dates and rejects slash dates", () => {
    const ms = dateParser("2009-07-12");
    expect(typeof ms).toBe("number");
    expect(ms).toBeGreaterThan(0);
    expect(dateParser("2009/07/12")).toBeNaN();
  });

  it("parseFloat_ and numberValueFormatter", () => {
    expect(parseFloat_("3.14")).toBeCloseTo(3.14);
    expect(numberValueFormatter(12.345, numberFormatterOpts)).toBe("12.35");
  });
});

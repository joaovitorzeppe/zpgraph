/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

/**
 * Y-axis id helpers: `"y"` / `"y1"` → 0, `"y2"` → 1, `"y3"` → 2, …
 */

import type { AxisName, AxisSide, YAxisName } from "./types";

const Y_AXIS_RE = /^y(\d+)$/i;

/** Index → name: 0 → `"y"`, 1 → `"y2"`, 2 → `"y3"`, … */
export const axisNameFromIndex = (index: number): YAxisName => {
  if (index < 0 || !Number.isInteger(index)) {
    throw new Error("Unknown axis index: " + index);
  }
  if (index === 0) {
    return "y";
  }
  const name: YAxisName = `y${index + 1}`;
  return name;
};

/**
 * Name or number → Y-axis index.
 * Accepts `"y"`, `"y1"`, `"Y2"`, `"y3"`, … and non-negative integers.
 */
export const axisIndexFromName = (axis: unknown): number => {
  if (typeof axis === "number") {
    if (Number.isInteger(axis) && axis >= 0) {
      return axis;
    }
    throw new Error("Unknown axis : " + axis);
  }
  if (typeof axis !== "string" || !axis) {
    if (axis) {
      throw new Error("Unknown axis");
    }
    return 0;
  }
  const lower = axis.toLowerCase();
  if (lower === "y" || lower === "y1") {
    return 0;
  }
  const m = Y_AXIS_RE.exec(lower);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2) {
      return n - 1;
    }
    if (n === 1) {
      return 0;
    }
  }
  throw new Error("Unknown axis : " + axis);
};

export const isYAxisName = (a: string): a is YAxisName => {
  const lower = a.toLowerCase();
  if (lower === "y" || lower === "y1") {
    return true;
  }
  const m = Y_AXIS_RE.exec(lower);
  return !!m && Number(m[1]) >= 1;
};

export const isAxisName = (a: string): a is AxisName =>
  a === "x" || a === "X" || isYAxisName(a);

export const normalizeAxisName = (axis: string): AxisName => {
  if (axis === "x" || axis === "X") {
    return "x";
  }
  return axisNameFromIndex(axisIndexFromName(axis));
};

/** Default side: y → left, y2 → right, y3+ → left. */
export const defaultAxisSide = (index: number): AxisSide =>
  index === 1 ? "right" : "left";

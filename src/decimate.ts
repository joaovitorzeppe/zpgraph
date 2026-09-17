/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { Point } from "./types";

export const DECIMATION_THRESHOLD = 4;

export type DecimatedPoints = Point[] & { _decimated?: true };

/** Min-max-first-last per pixel column of data x, before canvas coords exist. */
export const decimatePointsByX = (
  points: Point[],
  xMin: number,
  xMax: number,
  pixelWidth: number,
  threshold = DECIMATION_THRESHOLD,
): Point[] => {
  const span = xMax - xMin;
  if (
    !pixelWidth ||
    pixelWidth <= 0 ||
    !span ||
    span <= 0 ||
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    points.length < pixelWidth * threshold
  ) {
    return points;
  }

  const out: Point[] = [];
  let column = NaN;
  let first: Point | null = null;
  let last: Point | null = null;
  let lowest: Point | null = null;
  let highest: Point | null = null;
  let gap: Point | null = null;

  const flush = () => {
    if (first === null && gap === null) {
      return;
    }
    const chosen: Point[] = [];
    const push = (p: Point | null) => {
      if (p && !chosen.includes(p)) {
        chosen.push(p);
      }
    };
    push(first);
    push(lowest);
    push(highest);
    push(last);
    push(gap);
    chosen.sort((a, b) => (a.xval ?? 0) - (b.xval ?? 0));
    for (const p of chosen) {
      out.push(p);
    }
    first = last = lowest = highest = gap = null;
  };

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const xval = point.xval;
    if (xval === null || xval === undefined || xval !== xval) {
      continue;
    }

    let col = Math.floor(((xval - xMin) / span) * pixelWidth);
    if (col < 0) {
      col = 0;
    } else if (col >= pixelWidth) {
      col = pixelWidth - 1;
    }

    if (col !== column) {
      flush();
      column = col;
    }

    const y = point.yval;
    if (y === null || y === undefined || y !== y) {
      if (gap === null) {
        gap = point;
      }
      continue;
    }

    if (first === null) {
      first = point;
    }
    last = point;
    if (lowest === null || y < lowest.yval!) {
      lowest = point;
    }
    if (highest === null || y > highest.yval!) {
      highest = point;
    }
  }
  flush();

  if (out.length === points.length) {
    return points;
  }

  const decimated = out as DecimatedPoints;
  decimated._decimated = true;
  return decimated;
};

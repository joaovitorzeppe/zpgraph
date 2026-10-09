/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

/**
 * Shared Y-axis gutter layout: each axis on a side gets a column
 * `[ticks][title?]` stacked from the plot outward (ascending index first).
 */

import {
  axisNameFromIndex,
  defaultAxisSide,
} from "./axis-ids";
import type { AxisSide, YAxisName } from "./types";
import type { ZpgraphInstance } from "./internal-types";

export type AxisColumn = {
  index: number;
  name: YAxisName;
  side: AxisSide;
  /** Distance from plot edge to the start of this column (toward outside). */
  offset: number;
  tickWidth: number;
  titleWidth: number;
  title: string | null;
  /** tickWidth + titleWidth */
  columnWidth: number;
};

const axisNum = (g: ZpgraphInstance, axis: string, opt: string) =>
  Number(g.getOptionForAxis(opt, axis));

export const resolveAxisSide = (
  g: ZpgraphInstance,
  index: number,
): AxisSide => {
  const raw = g.getOptionForAxis("side", axisNameFromIndex(index));
  if (raw === "left" || raw === "right") {
    return raw;
  }
  return defaultAxisSide(index);
};

export const axisTickColumnWidth = (
  g: ZpgraphInstance,
  name: string,
): number =>
  axisNum(g, name, "axisLabelWidth") + 2 * axisNum(g, name, "axisTickSize");

/** Title text for axis index, or null if none. */
export const axisTitleText = (
  g: ZpgraphInstance,
  index: number,
): string | null => {
  if (index === 0) {
    const t = g.getOption("ylabel");
    return typeof t === "string" && t ? t : null;
  }
  if (index === 1) {
    const t = g.getOption("y2label");
    return typeof t === "string" && t ? t : null;
  }
  const t = g.getOptionForAxis("label", axisNameFromIndex(index));
  return typeof t === "string" && t ? t : null;
};

/**
 * Columns for one side, plot-adjacent first (ascending axis index among
 * axes that draw on that side).
 */
export const buildAxisColumns = (
  g: ZpgraphInstance,
  side: AxisSide,
): AxisColumn[] => {
  const titleW = g.getNumericOption("yLabelWidth");
  const cols: AxisColumn[] = [];
  let acc = 0;
  const n = g.numAxes();
  for (let i = 0; i < n; i++) {
    if (g.attributes_.seriesForAxis(i).length === 0) {
      continue;
    }
    const name = axisNameFromIndex(i);
    if (!g.getOptionForAxis("drawAxis", name)) {
      continue;
    }
    if (resolveAxisSide(g, i) !== side) {
      continue;
    }
    const title = axisTitleText(g, i);
    const tickWidth = axisTickColumnWidth(g, name);
    const titleWidth = title ? titleW : 0;
    const columnWidth = tickWidth + titleWidth;
    cols.push({
      index: i,
      name,
      side,
      offset: acc,
      tickWidth,
      titleWidth,
      title,
      columnWidth,
    });
    acc += columnWidth;
  }
  return cols;
};

export const sideGutterWidth = (g: ZpgraphInstance, side: AxisSide): number =>
  buildAxisColumns(g, side).reduce((sum, c) => sum + c.columnWidth, 0);

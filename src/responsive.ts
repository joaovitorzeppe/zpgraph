/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ResponsiveRule, ZpgraphOptions } from "./types";
import type Zpgraph from "./zpgraph";

/** Active breakpoint per chart instance (avoids update loops). */
const breakpointByChart = new WeakMap<object, number>();
/** Options before the first breakpoint override, restored when none match. */
const baseByChart = new WeakMap<object, Partial<ZpgraphOptions>>();

const isResponsiveRule = (r: unknown): r is ResponsiveRule => {
  if (typeof r !== "object" || r === null) {
    return false;
  }
  if (!("breakpoint" in r) || !("options" in r)) {
    return false;
  }
  return typeof r.breakpoint === "number" && typeof r.options === "object";
};

/**
 * Apply responsive option overrides for the current container width.
 * Tracks the active breakpoint on the instance to avoid update loops.
 */
export const applyResponsiveOptions = (g: Zpgraph): void => {
  const rulesOpt = g.getOption("responsive");
  const rules = Array.isArray(rulesOpt)
    ? rulesOpt.filter(isResponsiveRule)
    : [];
  if (!rules.length) {
    return;
  }

  const width = g.width_ || g.maindiv_?.clientWidth || 0;
  const sorted = [...rules].toSorted((a, b) => a.breakpoint - b.breakpoint);
  const match = sorted.find((rule) => width <= rule.breakpoint);

  const key = match ? match.breakpoint : -1;
  const prev = breakpointByChart.get(g);
  if (prev === key) {
    return;
  }

  if (!baseByChart.has(g)) {
    const snap: Partial<ZpgraphOptions> = {};
    for (const rule of sorted) {
      for (const name of Object.keys(rule.options)) {
        if (name === "responsive" || name in snap) {
          continue;
        }
        Reflect.set(snap, name, g.getOption(name));
      }
    }
    baseByChart.set(g, snap);
  }
  breakpointByChart.set(g, key);

  if (!match) {
    const snap = baseByChart.get(g);
    if (snap) {
      g.updateOptions(snap, false);
    }
    return;
  }

  // Strip nested responsive to avoid recursion.
  const { responsive: _r, ...rest } = match.options;
  g.updateOptions(rest, false);
};

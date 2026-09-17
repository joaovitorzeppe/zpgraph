/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ResponsiveRule, ZpgraphOptions } from "./types";
import type Zpgraph from "./zpgraph";

/**
 * Apply responsive option overrides for the current container width.
 * Tracks the active breakpoint on the instance to avoid update loops.
 */
export const applyResponsiveOptions = (g: Zpgraph): void => {
  const rules = g.getOption("responsive") as ResponsiveRule[] | undefined;
  if (!rules?.length) return;

  const width = g.width_ || g.maindiv_?.clientWidth || 0;
  const sorted = [...rules].toSorted((a, b) => a.breakpoint - b.breakpoint);
  let match: ResponsiveRule | undefined;
  for (const rule of sorted) {
    if (width <= rule.breakpoint) {
      match = rule;
      break;
    }
  }

  const key = match ? match.breakpoint : -1;
  const prev = (g as unknown as { responsiveBreakpoint_: number })
    .responsiveBreakpoint_;
  if (prev === key) return;
  (g as unknown as { responsiveBreakpoint_: number }).responsiveBreakpoint_ =
    key;

  if (!match) return;

  // Strip nested responsive to avoid recursion.
  const { responsive: _r, ...rest } = match.options;
  g.updateOptions(rest as Partial<ZpgraphOptions>, false);
};

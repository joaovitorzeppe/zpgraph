/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type Zpgraph from "./zpgraph";
import type { ChartClassNames } from "./types";

export type { ChartClassNames };

// Allow Tailwind utilities (`md:text-sm`, `bg-black/50`, `w-[13px]`) while
// blocking whitespace and characters that break out of a class attribute.
const SAFE_CSS_CLASS = /^[^\s<>"'`;\\]+$/;

/** Split and filter a className string for safe DOM use. */
export const safeCssClasses = (cssClass: unknown): string[] =>
  typeof cssClass === "string"
    ? cssClass
        .split(/\s+/)
        .filter((c) => c.length > 0 && SAFE_CSS_CLASS.test(c))
    : [];

/** `base` plus optional extra classes from the app. */
export const withClassNames = (base: string, extra?: string): string => {
  const safe = safeCssClasses(extra);
  return safe.length ? base + " " + safe.join(" ") : base;
};

/** Apply base class + optional LabelStyle + chart-level classNames slot. */
export const applyLabelStyle = (
  el: HTMLElement,
  baseClass: string,
  labelStyle?: { className?: string; style?: Record<string, string> },
  chartSlotClass?: string,
): void => {
  el.className = withClassNames(
    withClassNames(baseClass, labelStyle?.className),
    chartSlotClass,
  );
  if (labelStyle?.style) {
    for (const [name, value] of Object.entries(labelStyle.style)) {
      el.style.setProperty(name, value);
    }
  }
};

export const getChartClassNames = (
  g: Pick<Zpgraph, "getOption">,
): ChartClassNames => {
  const value = g.getOption("classNames");
  return value && typeof value === "object" ? (value as ChartClassNames) : {};
};

/** Keep `graphDiv.className` as `zpgraph` + optional `classNames.root`. */
export const applyRootClassNames = (g: Zpgraph): void => {
  if (!g.graphDiv) {
    return;
  }
  g.graphDiv.className = withClassNames("zpgraph", getChartClassNames(g).root);
};

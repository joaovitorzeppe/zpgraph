/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type Zpgraph from "./zpgraph";
import type { ZpgraphOptions } from "./types";

export type ChartTheme = "light" | "dark";

/** Canvas chrome colors for light backgrounds (matches DEFAULT_ATTRS). */
export const themes = {
  light: {
    axisLineColor: "black",
    gridLineColor: "rgb(128,128,128)",
    highlightSeriesBackgroundColor: "rgb(255, 255, 255)",
    strokeBorderColor: "white",
    rangeSelectorPlotStrokeColor: "#808FAB",
    rangeSelectorPlotFillGradientColor: "white",
    rangeSelectorPlotFillColor: "#A7B1C4",
    rangeSelectorBackgroundStrokeColor: "gray",
    rangeSelectorForegroundStrokeColor: "black",
  },
  dark: {
    axisLineColor: "#c0c0c0",
    gridLineColor: "rgb(80,80,80)",
    highlightSeriesBackgroundColor: "rgb(20, 20, 20)",
    strokeBorderColor: "#141414",
    rangeSelectorPlotStrokeColor: "#8FA3C8",
    rangeSelectorPlotFillGradientColor: "#1a1a1a",
    rangeSelectorPlotFillColor: "#3a4558",
    rangeSelectorBackgroundStrokeColor: "#666666",
    rangeSelectorForegroundStrokeColor: "#e0e0e0",
  },
} as const satisfies Record<ChartTheme, Partial<ZpgraphOptions>>;

const THEME_KEYS = [
  "axisLineColor",
  "gridLineColor",
  "highlightSeriesBackgroundColor",
  "strokeBorderColor",
  "rangeSelectorPlotStrokeColor",
  "rangeSelectorPlotFillGradientColor",
  "rangeSelectorPlotFillColor",
  "rangeSelectorBackgroundStrokeColor",
  "rangeSelectorForegroundStrokeColor",
] as const satisfies ReadonlyArray<keyof (typeof themes)["light"]>;

/**
 * Sets `data-theme` on graphDiv and paints canvas chrome from `themes[theme]`.
 * Keys already present in `user_attrs_` win (user override).
 */
export const applyTheme = (g: Zpgraph): void => {
  const theme = g.user_attrs_.theme;
  if (theme !== "light" && theme !== "dark") {
    return;
  }

  if (g.graphDiv) {
    g.graphDiv.setAttribute("data-theme", theme);
  }

  const preset = themes[theme];

  for (const key of THEME_KEYS) {
    if (Object.hasOwn(g.user_attrs_, key)) {
      continue;
    }
    g.attrs_[key] = preset[key];
  }
};

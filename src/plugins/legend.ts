"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*global Zpgraph:false */

/*
Current bits of jankiness:
- Uses two private APIs:
    1. Zpgraph.optionsViewForAxis_
    2. zpgraph.plotter_.area
- Registers for a "predraw" event, which should be renamed.
*/

/*global Zpgraph:false */

import type {
  OptionsGetter,
  LayoutPluginEvent,
  ZpgraphInstance,
} from "../internal-types";
import type {
  Point,
  TooltipOptions,
  TooltipPosition,
  ValueFormatter,
} from "../types";
import { getChartClassNames, withClassNames } from "../class-names";

interface LegendPluginEvent {
  zpgraph: ZpgraphInstance;
  selectedX?: number;
  selectedPoints?: Point[];
  selectedRow?: number;
}

type LegendChart = LegendGraphLike & {
  optionsViewForAxis_(axis: string): OptionsGetter;
};

interface LegendGraphLike {
  getLabels(): string[] | null;
  getPropertiesForSeries(seriesName: string): {
    name: string;
    column: number;
    visible: boolean;
    color: string;
    axis: number;
  } | null;
  getOption(name: string, series?: string): unknown;
  getHighlightSeries(): string | null | undefined;
  numAxes(): number;
  optionsViewForAxis_?(axis: string): OptionsGetter;
}

interface LegendSeriesRow {
  label: string;
  labelHTML: string;
  dashHTML: string;
  dashSegments_?: DashSegment[] | null;
  color: string;
  isVisible: boolean;
  isHighlighted?: boolean;
  y?: number | null;
  yHTML?: string;
}

interface LegendBuildData {
  zpgraph: LegendGraphLike;
  x?: number;
  xHTML?: string;
  i: number | null;
  series: LegendSeriesRow[];
}

type LegendFormatterFn = (
  this: LegendChart,
  data: LegendBuildData,
) => string | DocumentFragment | Node;

const ABOVE_PLOT_GAP = 4;
/** Default top chrome when tooltip.position is top-* (keeps tip off the series). */
const DEFAULT_TOOLTIP_RESERVE_TOP = 0;
const DEFAULT_FOLLOW_OFFSET_X = 50;
const DEFAULT_FOLLOW_OFFSET_Y = -50;

type TooltipShowMode = "never" | "onmouseover" | "always";

type TooltipOptionSource = {
  getOption(name: string, series?: string): unknown;
};

const resolveTooltipShow = (g: TooltipOptionSource): TooltipShowMode => {
  const tip = g.getOption("tooltip") as TooltipOptions | undefined;
  const show = tip?.show;
  if (show === "never" || show === "always" || show === "onmouseover") {
    return show;
  }
  return "onmouseover";
};

const resolveTooltipPosition = (g: TooltipOptionSource): TooltipPosition => {
  const tip = g.getOption("tooltip") as TooltipOptions | undefined;
  return tip?.position ?? "top-right";
};

const isTopTooltip = (position: TooltipPosition) =>
  position === "top-left" || position === "top-right";

/**
 * Place generated legend for fixed modes (onmouseover / always).
 * Top corners with an explicit tooltip.position sit above the plot.
 */
const placeFixedLegend = (g: ZpgraphInstance, div: HTMLElement): void => {
  const area = g.plotter_.area;
  const tip = g.getOption("tooltip") as TooltipOptions | undefined;
  const explicit = tip?.position;
  const position: TooltipPosition =
    explicit && explicit !== "follow" ? explicit : "top-right";
  const ox = tip?.offsetX ?? 0;
  const oy = tip?.offsetY ?? 0;
  const w = div.offsetWidth;
  const h = div.offsetHeight;
  const abovePlot = !!explicit && isTopTooltip(explicit);

  let left = area.x;
  let top = area.y;

  switch (position) {
    case "top-left":
      left = area.x + ox;
      top = abovePlot
        ? Math.max(0, area.y - h - ABOVE_PLOT_GAP) + oy
        : area.y + oy;
      break;
    case "top-right":
      left = area.x + area.w - w - 1 + ox;
      top = abovePlot
        ? Math.max(0, area.y - h - ABOVE_PLOT_GAP) + oy
        : area.y + oy;
      break;
    case "bottom-left":
      left = area.x + ox;
      top = area.y + area.h - h + oy;
      break;
    case "bottom-right":
      left = area.x + area.w - w - 1 + ox;
      top = area.y + area.h - h + oy;
      break;
  }

  div.style.left = `${left}px`;
  div.style.top = `${top}px`;
};

const placeFollowLegend = (
  g: ZpgraphInstance,
  div: HTMLElement,
  points: Point[],
): void => {
  if (points.length === 0) return;
  const tip = g.getOption("tooltip") as TooltipOptions | undefined;
  const area = g.plotter_.area;
  const labelsDivWidth = div.offsetWidth;
  const yAxisLabelWidth = Number(g.getOptionForAxis("axisLabelWidth", "y"));
  const highlightSeries = g.getHighlightSeries();
  let point = points[0]!;
  if (highlightSeries) {
    point = points.find((p) => p.name === highlightSeries) ?? point;
  }
  const followOffsetX = tip?.offsetX ?? DEFAULT_FOLLOW_OFFSET_X;
  const followOffsetY = tip?.offsetY ?? DEFAULT_FOLLOW_OFFSET_Y;
  let leftLegend = (point.x ?? 0) * area.w + followOffsetX;
  const topLegend = (point.y ?? 0) * area.h + followOffsetY;

  if (leftLegend + labelsDivWidth + 1 > area.w) {
    leftLegend =
      leftLegend -
      2 * followOffsetX -
      labelsDivWidth -
      (yAxisLabelWidth - area.x);
  }

  div.style.left = yAxisLabelWidth + leftLegend + "px";
  div.style.top = topLegend + "px";
};

const tooltipReserveTop = (g: ZpgraphInstance): number => {
  const tip = g.getOption("tooltip") as TooltipOptions | undefined;
  if (!tip?.position || !isTopTooltip(tip.position)) return 0;
  if (tip.reserveTop != null) return Math.max(0, tip.reserveTop);
  return DEFAULT_TOOLTIP_RESERVE_TOP;
};

/**
 * Creates the legend, which appears when the user hovers over the chart.
 * The legend can be either a user-specified or generated div.
 *
 * @constructor
 */
class Legend {
  legend_div_: HTMLElement | null = null;

  /** Do we own this div, or was it user-specified? */
  is_generated_div_ = false;

  /** Width of one em in the legend div, re-measured each predraw. */
  one_em_width_ = 10;

  toString() {
    return "Legend Plugin";
  }

  activate(g: ZpgraphInstance) {
    let div: HTMLElement | null = null;

    const userLabelsDiv = g.getOption("labelsDiv");
    if (userLabelsDiv && null !== userLabelsDiv) {
      if (typeof userLabelsDiv == "string" || userLabelsDiv instanceof String) {
        div = document.getElementById(String(userLabelsDiv));
      } else {
        div = userLabelsDiv as HTMLElement;
      }
    } else {
      div = document.createElement("div");
      div.className = withClassNames(
        "zpgraph-legend",
        getChartClassNames(g).legend,
      );
      // The values under the cursor are the chart's readable content: announce
      // them when they change, without interrupting whatever is being read.
      div.setAttribute("aria-live", "polite");
      g.graphDiv.appendChild(div);
      this.is_generated_div_ = true;
    }

    this.legend_div_ = div;
    this.one_em_width_ = 10; // just a guess, will be updated.

    return {
      layout: this.layout,
      select: this.select,
      deselect: this.deselect,
      predraw: this.predraw,
      didDrawChart: this.didDrawChart,
    };
  }

  layout(e: LayoutPluginEvent) {
    const g = e.zpgraph;
    if (resolveTooltipShow(g) === "never") return;
    if (resolveTooltipPosition(g) === "follow") return;
    const px = tooltipReserveTop(g);
    if (px > 0) e.reserveSpaceTop(px);
  }

  select(e: LegendPluginEvent) {
    const div = this.legend_div_;
    if (!div) return;

    let xValue = e.selectedX;
    let points = e.selectedPoints;
    let row = e.selectedRow;

    const show = resolveTooltipShow(e.zpgraph);
    if (show === "never") {
      div.style.display = "none";
      return;
    }

    const html = Legend.generateLegendHTML(
      e.zpgraph,
      xValue,
      points,
      this.one_em_width_,
      row ?? null,
    );
    if (html instanceof Node) {
      div.replaceChildren(html);
    } else {
      // Trusted app HTML — see README "Content Security Policy".
      div.innerHTML = html;
    }
    // must be done now so offsetWidth isn’t 0…
    div.style.display = "";

    const position = resolveTooltipPosition(e.zpgraph);
    if (position === "follow") {
      placeFollowLegend(e.zpgraph, div, points ?? []);
    } else if (this.is_generated_div_) {
      placeFixedLegend(e.zpgraph, div);
    }
  }

  deselect(e: LegendPluginEvent) {
    const div = this.legend_div_;
    if (!div) return;

    if (resolveTooltipShow(e.zpgraph) !== "always") {
      // Building the rows would only fill a div nobody can see, and the next
      // select rebuilds them anyway. This runs after every draw, so on a drag it
      // is once per frame.
      div.style.display = "none";
      return;
    }

    let html = Legend.generateLegendHTML(
      e.zpgraph,
      undefined,
      undefined,
      this.one_em_width_,
      null,
    );
    if (html instanceof Node) {
      div.replaceChildren(html);
    } else {
      // Trusted app HTML — see README "Content Security Policy".
      div.innerHTML = html;
    }
  }

  didDrawChart(e: LegendPluginEvent) {
    this.deselect(e);
  }

  predraw(e: LegendPluginEvent) {
    const div = this.legend_div_;
    if (!div) return;

    // Measuring an em forces a layout, so it happens here — on a data or option
    // change, which is also when the styles behind it can have changed — rather
    // than on every draw. Re-measure each predraw so CSS/font changes apply.
    this.one_em_width_ = calculateEmWidthInDiv(div);

    // Don't touch a user-specified labelsDiv.
    if (!this.is_generated_div_) return;

    div.className = withClassNames(
      "zpgraph-legend",
      getChartClassNames(e.zpgraph).legend,
    );

    e.zpgraph.graphDiv.appendChild(div);
    placeFixedLegend(e.zpgraph, div);
  }

  destroy() {
    this.legend_div_ = null;
  }

  /**
   * Build legend content for the selection.
   * Prefer a DocumentFragment/Node from legendFormatter; a string is trusted
   * application HTML (innerHTML). See README CSP section.
   */
  static generateLegendHTML(
    g: LegendGraphLike,
    x: number | undefined,
    sel_points: Point[] | undefined,
    oneEmWidth: number,
    row: number | null,
  ): string | DocumentFragment | Node {
    const chart = g as LegendChart;
    // Data about the selection to pass to legendFormatter
    const data: LegendBuildData = {
      zpgraph: g,
      i: row,
      series: [],
    };
    if (x !== undefined) {
      data.x = x;
    }

    const labelToSeries: Record<string, LegendSeriesRow> = {};
    const labels = g.getLabels();
    if (labels) {
      for (let i = 1; i < labels.length; i++) {
        const label = labels[i]!;
        const series = g.getPropertiesForSeries(label);
        if (!series) continue;
        const strokePattern = g.getOption("strokePattern", label) as
          | number[]
          | null
          | undefined;
        // Sanitize once here so the default formatter, the dash markup and any
        // caller-supplied legendFormatter all see a color safe to interpolate.
        const color = sanitizeCssColor(series.color);
        const dashSegments = legendDashSegments(strokePattern, oneEmWidth);
        const seriesData: LegendSeriesRow = {
          dashHTML: dashSegmentsToHTML(dashSegments, color),
          dashSegments_: dashSegments,
          label: label,
          labelHTML: escapeHTML(label),
          isVisible: series.visible,
          color: color,
        };

        data.series.push(seriesData);
        labelToSeries[label] = seriesData;
      }
    }

    if (
      typeof x !== "undefined" &&
      labels &&
      sel_points &&
      chart.optionsViewForAxis_
    ) {
      const xOptView = chart.optionsViewForAxis_("x");
      const xvf = xOptView("valueFormatter") as ValueFormatter;
      data.xHTML = xvf(x, xOptView, labels[0]!, g, row ?? 0, 0);

      const yOptViews: OptionsGetter[] = [];
      const num_axes = g.numAxes();
      for (let i = 0; i < num_axes; i++) {
        yOptViews[i] = chart.optionsViewForAxis_!("y" + (i ? 1 + i : ""));
      }

      const showZeros = g.getOption("labelsShowZeroValues");
      const highlightSeries = g.getHighlightSeries();
      for (let i = 0; i < sel_points.length; i++) {
        const pt = sel_points[i]!;
        const seriesData = labelToSeries[pt.name];
        if (!seriesData) continue;
        seriesData.y = pt.yval ?? null;

        if ((pt.yval === 0 && !showZeros) || isNaN(pt.canvasy ?? NaN)) {
          seriesData.isVisible = false;
          continue;
        }

        const series = g.getPropertiesForSeries(pt.name);
        if (!series) continue;
        const yOptView = yOptViews[series.axis - 1]!;
        const fmtFunc = yOptView("valueFormatter") as ValueFormatter;
        const yHTML = fmtFunc(
          pt.yval ?? 0,
          yOptView,
          pt.name,
          g,
          row ?? 0,
          labels.indexOf(pt.name),
        );

        seriesData.yHTML = yHTML;

        if (pt.name === highlightSeries) {
          seriesData.isHighlighted = true;
        }
      }
    }

    const formatter = (g.getOption("legendFormatter") ??
      Legend.defaultFormatter) as LegendFormatterFn;
    return formatter.call(chart, data);
  }

  static defaultFormatter(data: LegendBuildData): DocumentFragment {
    const g = data.zpgraph;

    const fragment = document.createDocumentFragment();
    if (g.getOption("showLabelsOnHighlight") !== true) return fragment;

    const sepLines = g.getOption("labelsSeparateLines");

    if (typeof data.x === "undefined") {
      if (resolveTooltipShow(g) !== "always") {
        return fragment;
      }

      let first = true;
      for (let i = 0; i < data.series.length; i++) {
        const series = data.series[i]!;
        if (!series.isVisible) continue;

        if (!first) {
          fragment.appendChild(
            sepLines
              ? document.createElement("br")
              : document.createTextNode(" "),
          );
        }
        first = false;

        let span = document.createElement("span");
        span.style.fontWeight = "bold";
        span.style.color = series.color;
        span.appendChild(
          dashSegmentsToNodes(series.dashSegments_ ?? null, series.color),
        );
        span.appendChild(document.createTextNode(" " + series.label));
        fragment.appendChild(span);
      }
      return fragment;
    }

    fragment.appendChild(document.createTextNode((data.xHTML ?? "") + ":"));
    for (let i = 0; i < data.series.length; i++) {
      const series = data.series[i]!;
      if (!series.y && !series.yHTML) continue;
      if (!series.isVisible) continue;
      if (sepLines) fragment.appendChild(document.createElement("br"));

      let span = document.createElement("span");
      if (series.isHighlighted) span.className = "highlight";

      let name = document.createElement("span");
      name.style.color = series.color;
      name.textContent = series.label;
      let bold = document.createElement("b");
      bold.appendChild(name);

      span.appendChild(document.createTextNode(" "));
      span.appendChild(bold);
      // The value comes from a valueFormatter, which callers override; it is
      // inserted as text, the way the axis labels are.
      span.appendChild(document.createTextNode(":\u00a0" + series.yHTML));
      fragment.appendChild(span);
    }
    return fragment;
  }
}

/**
 * This is called during the zpgraph constructor, after options have been set
 * but before the data is available.
 *
 * Proper tasks to do here include:
 * - Reading your own options
 * - DOM manipulation
 * - Registering event listeners
 *
 * @param g Graph instance.
 * @return Mapping of event names to callbacks.
 */

// Needed for dashed lines.
let calculateEmWidthInDiv = function (div: HTMLElement): number {
  let sizeSpan = document.createElement("span");
  // Through the CSSOM rather than a style attribute, which a strict
  // style-src refuses.
  sizeSpan.style.margin = "0";
  sizeSpan.style.padding = "0 0 0 1em";
  sizeSpan.style.border = "0";
  div.appendChild(sizeSpan);
  let oneEmWidth = sizeSpan.offsetWidth;
  div.removeChild(sizeSpan);
  return oneEmWidth;
};

let escapeHTML = function (str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&#34;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

// A color still reaches a style="..." attribute through `dashHTML` and through
// any legendFormatter that builds a string, where a quote or a semicolon can
// close the declaration and add its own. Allow only the shapes a CSS color can
// actually take.
const CSS_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([0-9a-z%.,/\s+-]*\))$/i;

/** @private */
const sanitizeCssColor = function (color: unknown): string {
  return typeof color === "string" && CSS_COLOR.test(color.trim())
    ? color.trim()
    : "inherit";
};

// Right edge should be flush with the right edge of the charting area (which
// may not be the same as the right edge of the div, if we have two y-axes).
/**
 * Position the labels div so that:
 * - its right edge is flush with the right edge of the charting area
 * - its top edge is flush with the top edge of the charting area
 * @private
 */

/**
 * Called when zpgraph.destroy() is called.
 * You should null out any references and detach any DOM elements.
 */

/**
 * Generates HTML for the legend which is displayed when hovering over the
 * chart. If no selected points are specified, a default legend is returned
 * (this may just be the empty string).
 * @param x The x-value of the selected points.
 * @param sel_points List of selected points for the given
 *   x-value. Should have properties like 'name', 'yval' and 'canvasy'.
 * @param oneEmWidth The pixel width for 1em in the legend. Only
 *   relevant when displaying a legend with no selection (i.e. {legend:
 *   'always'}) and with dashed lines.
 * @param row The selected row index.
 * @private
 */

/**
 * The built-in legend is built as nodes, not as markup: colors are applied
 * through the CSSOM, which a `style-src 'self'` policy allows, while the same
 * colors written into a style attribute of parsed HTML would be dropped.
 */

/** One drawn piece of the legend "dash", measured in em. @private */
interface DashSegment {
  paddingLeft: number;
  marginRight: number;
}

/**
 * Lays out the "dash" displayed on the legend when using "legend: always".
 * In particular, this works for dashed lines with any stroke pattern. It will
 * try to scale the pattern to fit in 1em width. Or if small enough repeat the
 * pattern for 1em width.
 *
 * Returns the segments rather than the markup, so the same layout can be
 * rendered as nodes for the built-in legend and as a string for the `dashHTML`
 * a caller's legendFormatter concatenates.
 *
 * @param strokePattern The pattern
 * @param oneEmWidth The width in pixels of 1em in the legend.
 * @return null for a solid line, which has no segments.
 * @private
 */
function legendDashSegments(
  strokePattern: number[] | null | undefined,
  oneEmWidth: number,
): DashSegment[] | null {
  // Easy, common case: a solid line
  if (!strokePattern || strokePattern.length <= 1) {
    return null;
  }

  let i, j, paddingLeft, marginRight;
  let strokePixelLength = 0,
    segmentLoop = 0;
  const normalizedPattern: number[] = [];
  let loop: number;
  const firstSegment = strokePattern[0]!;

  // Compute the length of the pixels including the first segment twice,
  // since we repeat it.
  for (i = 0; i <= strokePattern.length; i++) {
    strokePixelLength += strokePattern[i % strokePattern.length]!;
  }

  // See if we can loop the pattern by itself at least twice.
  loop = Math.floor(oneEmWidth / (strokePixelLength - firstSegment));
  if (loop > 1) {
    // This pattern fits at least two times, no scaling just convert to em;
    for (i = 0; i < strokePattern.length; i++) {
      normalizedPattern[i] = strokePattern[i]! / oneEmWidth;
    }
    // Since we are repeating the pattern, we don't worry about repeating the
    // first segment in one draw.
    segmentLoop = normalizedPattern.length;
  } else {
    // If the pattern doesn't fit in the legend we scale it to fit.
    loop = 1;
    for (i = 0; i < strokePattern.length; i++) {
      normalizedPattern[i] = strokePattern[i]! / strokePixelLength;
    }
    // For the scaled patterns we do redraw the first segment.
    segmentLoop = normalizedPattern.length + 1;
  }

  // Now make the pattern.
  const segments: DashSegment[] = [];
  for (j = 0; j < loop; j++) {
    for (i = 0; i < segmentLoop; i += 2) {
      // The padding is the drawn segment.
      paddingLeft = normalizedPattern[i % normalizedPattern.length]!;
      if (i < strokePattern.length) {
        // The margin is the space segment.
        marginRight = normalizedPattern[(i + 1) % normalizedPattern.length]!;
      } else {
        // The repeated first segment has no right margin.
        marginRight = 0;
      }
      segments.push({ paddingLeft: paddingLeft, marginRight: marginRight });
    }
  }
  return segments;
}

/**
 * The dash as markup, for a legendFormatter that builds a string.
 * @private
 */
function dashSegmentsToHTML(
  segments: DashSegment[] | null,
  color: string,
): string {
  if (!segments) {
    return `<div class="zpgraph-legend-line" style="border-bottom-color: ${color};"></div>`;
  }
  return segments
    .map(
      (s) =>
        `<div class="zpgraph-legend-dash" style="margin-right: ${s.marginRight}em; padding-left: ${s.paddingLeft}em;"></div>`,
    )
    .join("");
}

/**
 * The dash as nodes, so the built-in legend never asks the parser to read a
 * style attribute.
 * @private
 */
function dashSegmentsToNodes(
  segments: DashSegment[] | null,
  color: string,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!segments) {
    const line = document.createElement("div");
    line.className = "zpgraph-legend-line";
    line.style.borderBottomColor = color;
    fragment.appendChild(line);
    return fragment;
  }
  for (const s of segments) {
    const dash = document.createElement("div");
    dash.className = "zpgraph-legend-dash";
    dash.style.marginRight = s.marginRight + "em";
    dash.style.paddingLeft = s.paddingLeft + "em";
    fragment.appendChild(dash);
  }
  return fragment;
}

export default Legend;

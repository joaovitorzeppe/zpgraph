/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ZpgraphInstance } from "../internal-types";
import type { ZpgraphOptions } from "../types";
import type ZpgraphClass from "../zpgraph";

export type ZoomLimitsOptions = {
  /** Minimum allowed x-span in ms (or raw x units). Default: none. */
  minSpanMs?: number;
  /** Maximum allowed x-span. Default: full data range when clampToData. */
  maxSpanMs?: number;
  /** Keep the window inside xAxisExtremes. Default true. */
  clampToData?: boolean;
};


const attachedLimits = new WeakMap<object, ZoomLimitsOptions>();

/** Read limits attached by the ZoomLimits plugin, if any. */
export const getAttachedZoomLimits = (
  g: ZpgraphInstance,
): ZoomLimitsOptions | undefined => attachedLimits.get(g);

/**
 * Clamp `[lo, hi]` to min/max span and (optionally) data extremes.
 * Returns the adjusted window.
 */
export const clampDateWindow = (
  g: ZpgraphInstance,
  window: [number, number],
  opts: ZoomLimitsOptions = {},
): [number, number] => {
  let [lo, hi] = window[0] <= window[1] ? window : [window[1], window[0]];
  let span = hi - lo;
  const clampToData = opts.clampToData !== false;
  const extremes = g.xAxisExtremes();
  const dataSpan = extremes[1] - extremes[0];

  const minSpan = opts.minSpanMs;
  let maxSpan = opts.maxSpanMs;
  if (maxSpan == null && clampToData) {
    maxSpan = dataSpan;
  }
  if (minSpan != null && minSpan > 0 && span < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
    span = minSpan;
  }
  if (maxSpan != null && maxSpan > 0 && span > maxSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - maxSpan / 2;
    hi = mid + maxSpan / 2;
    span = maxSpan;
  }

  if (clampToData) {
    if (span >= dataSpan) {
      return [extremes[0], extremes[1]];
    }
    if (lo < extremes[0]) {
      lo = extremes[0];
      hi = lo + span;
    }
    if (hi > extremes[1]) {
      hi = extremes[1];
      lo = hi - span;
    }
  }

  return [lo, hi];
};

/**
 * Zoom around the center by `factor` (&lt;1 zoom in, &gt;1 zoom out).
 * Returns false when the window did not change (hit a limit).
 */
export const zoomBy = (
  g: ZpgraphInstance,
  factor: number,
  opts?: ZoomLimitsOptions,
): boolean => {
  const limits = opts ?? getAttachedZoomLimits(g) ?? {};
  const [x0, x1] = g.xAxisRange();
  const mid = (x0 + x1) / 2;
  const half = ((x1 - x0) / 2) * factor;
  const next = clampDateWindow(g, [mid - half, mid + half], limits);
  if (next[0] === x0 && next[1] === x1) {
    return false;
  }
  g.updateOptions({ dateWindow: next });
  return true;
};

/** Pan by a fraction of the current span (positive = right). */
export const panBy = (
  g: ZpgraphInstance,
  fraction: number,
  opts?: ZoomLimitsOptions,
): boolean => {
  const limits = opts ?? getAttachedZoomLimits(g) ?? {};
  const [x0, x1] = g.xAxisRange();
  const delta = (x1 - x0) * fraction;
  const next = clampDateWindow(g, [x0 + delta, x1 + delta], limits);
  if (next[0] === x0 && next[1] === x1) {
    return false;
  }
  g.updateOptions({ dateWindow: next });
  return true;
};

/**
 * Enforces min/max x-span and clamps to data on every dateWindow change
 * (updateOptions + drag zoom via doZoomXDates_).
 */
class ZoomLimits {
  opts_: ZoomLimitsOptions;
  g_: ZpgraphInstance | null = null;
  origDoZoomXDates_: ((minDate: number, maxDate: number) => void) | null =
    null;
  origUpdateOptions_:
    | ((attrs: Partial<ZpgraphOptions>, block_redraw?: boolean) => void)
    | null = null;

  constructor(opt_options?: ZoomLimitsOptions) {
    this.opts_ = opt_options || {};
  }

  toString() {
    return "ZoomLimits Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g;
    attachedLimits.set(g, this.opts_);

    this.origDoZoomXDates_ = g.doZoomXDates_.bind(g);
    g.doZoomXDates_ = (minDate: number, maxDate: number) => {
      const [lo, hi] = clampDateWindow(g, [minDate, maxDate], this.opts_);
      this.origDoZoomXDates_!(lo, hi);
    };

    this.origUpdateOptions_ = g.updateOptions.bind(g);
    g.updateOptions = (attrs, block_redraw) => {
      if (attrs.dateWindow) {
        const clamped = clampDateWindow(g, attrs.dateWindow, this.opts_);
        attrs = { ...attrs, dateWindow: clamped };
      }
      this.origUpdateOptions_!(attrs, block_redraw);
    };

    return {};
  }

  destroy() {
    const host = this.g_;
    if (!host) {
      return;
    }
    if (this.origDoZoomXDates_) {
      host.doZoomXDates_ = this.origDoZoomXDates_;
    }
    if (this.origUpdateOptions_) {
      host.updateOptions = this.origUpdateOptions_;
    }
    attachedLimits.delete(host);
    this.g_ = null;
  }
}


export default ZoomLimits;

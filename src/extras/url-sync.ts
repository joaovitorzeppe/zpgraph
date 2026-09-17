/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import ZpgraphImport from "zpgraph";
import type { ZpgraphInstance } from "../internal-types";
import type ZpgraphClass from "../zpgraph";

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  Plugins: Record<string, unknown> & { UrlSync?: typeof UrlSync };
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;
Zpgraph.Plugins = Zpgraph.Plugins || {};

export type UrlSyncOptions = {
  /** Query/hash param for range start. Default "from". */
  paramFrom?: string;
  /** Query/hash param for range end. Default "to". */
  paramTo?: string;
  /** Use location.hash instead of search. Default false. */
  useHash?: boolean;
  /** Also sync primary y valueRange. Default false. */
  syncY?: boolean;
  paramYMin?: string;
  paramYMax?: string;
};

const readParams = (useHash: boolean): URLSearchParams => {
  if (useHash) {
    const raw = location.hash.startsWith("#")
      ? location.hash.slice(1)
      : location.hash;
    // Support both "#from=1&to=2" and "#/?from=1&to=2"
    const q = raw.includes("=") ? raw.replace(/^\//, "") : "";
    return new URLSearchParams(q);
  }
  return new URLSearchParams(location.search);
};

const writeParams = (useHash: boolean, params: URLSearchParams): void => {
  const qs = params.toString();
  if (useHash) {
    const next = qs ? `#${qs}` : "#";
    if (location.hash !== next) {
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}${next}`,
      );
    }
    return;
  }
  const url = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== url) {
    history.replaceState(null, "", url);
  }
};

/**
 * Bidirectional dateWindow sync with URL query or hash params.
 */
class UrlSync {
  opts_: Required<
    Pick<
      UrlSyncOptions,
      "paramFrom" | "paramTo" | "useHash" | "syncY" | "paramYMin" | "paramYMax"
    >
  >;
  g_: ZpgraphInstance | null = null;
  writing_ = false;
  prevZoomCallback_:
    | ((minX: number, maxX: number, yRanges: Array<[number, number]>) => void)
    | null = null;

  constructor(opt_options?: UrlSyncOptions) {
    const opts = opt_options || {};
    this.opts_ = {
      paramFrom: opts.paramFrom || "from",
      paramTo: opts.paramTo || "to",
      useHash: !!opts.useHash,
      syncY: !!opts.syncY,
      paramYMin: opts.paramYMin || "ymin",
      paramYMax: opts.paramYMax || "ymax",
    };
  }

  toString() {
    return "UrlSync Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g as unknown as ZpgraphInstance;
    this.applyFromUrl_();

    const existing = g.getFunctionOption("zoomCallback") as
      | ((minX: number, maxX: number, yRanges: Array<[number, number]>) => void)
      | null;
    this.prevZoomCallback_ = existing;

    g.updateOptions(
      {
        zoomCallback: (minX, maxX, yRanges) => {
          this.writeToUrl_(minX, maxX, yRanges);
          this.prevZoomCallback_?.call(g, minX, maxX, yRanges);
        },
      },
      true,
    );

    return {};
  }

  applyFromUrl_() {
    const g = this.g_;
    if (!g) {
      return;
    }
    const params = readParams(this.opts_.useHash);
    const from = params.get(this.opts_.paramFrom);
    const to = params.get(this.opts_.paramTo);
    if (from == null || to == null) {
      return;
    }
    const lo = Number(from);
    const hi = Number(to);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      return;
    }
    const attrs: Record<string, unknown> = {
      dateWindow: [Math.min(lo, hi), Math.max(lo, hi)],
    };
    if (this.opts_.syncY) {
      const ymin = params.get(this.opts_.paramYMin);
      const ymax = params.get(this.opts_.paramYMax);
      if (ymin != null && ymax != null) {
        const y0 = Number(ymin);
        const y1 = Number(ymax);
        if (Number.isFinite(y0) && Number.isFinite(y1)) {
          attrs.valueRange = [Math.min(y0, y1), Math.max(y0, y1)];
        }
      }
    }
    this.writing_ = true;
    g.updateOptions(attrs as Parameters<ZpgraphInstance["updateOptions"]>[0]);
    this.writing_ = false;
  }

  writeToUrl_(minX: number, maxX: number, yRanges: Array<[number, number]>) {
    if (this.writing_) {
      return;
    }
    const params = readParams(this.opts_.useHash);
    params.set(this.opts_.paramFrom, String(minX));
    params.set(this.opts_.paramTo, String(maxX));
    if (this.opts_.syncY && yRanges[0]) {
      params.set(this.opts_.paramYMin, String(yRanges[0][0]));
      params.set(this.opts_.paramYMax, String(yRanges[0][1]));
    }
    writeParams(this.opts_.useHash, params);
  }

  destroy() {
    const g = this.g_;
    if (g) {
      if (this.prevZoomCallback_) {
        g.updateOptions({ zoomCallback: this.prevZoomCallback_ }, true);
      }
    }
    this.g_ = null;
  }
}

Zpgraph.Plugins.UrlSync = UrlSync;

export default UrlSync;

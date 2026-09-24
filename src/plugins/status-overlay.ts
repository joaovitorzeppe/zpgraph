/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { NoDataOptions } from "../types";
import { getChartClassNames, withClassNames } from "../class-names";

/**
 * Empty-state and loading overlays for the chart root.
 */
class status_overlay {
  noDataEl_: HTMLElement | null = null;
  loadingEl_: HTMLElement | null = null;

  toString() {
    return "Status Overlay Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      didDrawChart: this.didDrawChart,
      clearChart: this.clearChart,
    };
  }

  clearChart(_e: ChartDrawPluginEvent) {
    // didDrawChart hides or rewrites the same nodes. Detach here rebuilt them
    // on every frame.
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph;
    const loading = !!g.getOption("loading");
    const noDataRaw = g.getOption("noData");
    const noDataOpt =
      noDataRaw === false
        ? false
        : readNoDataOptions(noDataRaw);
    const empty = g.numRows() === 0;

    if (loading) {
      this.ensureLoading_(g);
      this.hideNoData_();
      return;
    }
    this.hideLoading_();

    if (noDataOpt === false) {
      this.hideNoData_();
      return;
    }

    if (empty) {
      this.ensureNoData_(g, noDataOpt);
    } else {
      this.hideNoData_();
    }
  }

  ensureLoading_(g: ZpgraphInstance) {
    if (!this.loadingEl_) {
      this.loadingEl_ = document.createElement("div");
      this.loadingEl_.setAttribute("role", "status");
      this.loadingEl_.textContent = "Loading…";
      g.graphDiv.appendChild(this.loadingEl_);
    }
    this.loadingEl_.className = withClassNames(
      "zpgraph-status zpgraph-loading",
      getChartClassNames(g).loading,
    );
    this.loadingEl_.hidden = false;
  }

  ensureNoData_(g: ZpgraphInstance, opt: NoDataOptions | undefined) {
    const text = opt?.text ?? "No data";
    if (!this.noDataEl_) {
      this.noDataEl_ = document.createElement("div");
      this.noDataEl_.setAttribute("role", "status");
      g.graphDiv.appendChild(this.noDataEl_);
    }
    this.noDataEl_.className = withClassNames(
      "zpgraph-status zpgraph-no-data",
      getChartClassNames(g).noData,
    );
    this.noDataEl_.textContent = text;
    this.noDataEl_.hidden = false;
  }

  hideLoading_() {
    if (this.loadingEl_) {
      this.loadingEl_.hidden = true;
    }
  }

  hideNoData_() {
    if (this.noDataEl_) {
      this.noDataEl_.hidden = true;
    }
  }

  detach_() {
    this.noDataEl_?.remove();
    this.loadingEl_?.remove();
    this.noDataEl_ = null;
    this.loadingEl_ = null;
  }

  destroy() {
    this.detach_();
  }
}

const readNoDataOptions = (v: unknown): NoDataOptions | undefined => {
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    return undefined;
  }
  const text = Reflect.get(v, "text");
  if (typeof text === "string") {
    return { text };
  }
  return {};
};

export default status_overlay;

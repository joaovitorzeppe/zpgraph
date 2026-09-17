/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ChartDrawPluginEvent, ZpgraphInstance } from "../internal-types";
import type { NoDataOptions } from "../types";
import { getChartClassNames, withClassNames } from "../class-names";
import type Zpgraph from "../zpgraph";

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
    this.detach_();
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph as unknown as Zpgraph;
    const loading = !!g.getOption("loading");
    const noDataOpt = g.getOption("noData") as
      | NoDataOptions
      | false
      | undefined;
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

  ensureLoading_(g: Zpgraph) {
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

  ensureNoData_(g: Zpgraph, opt: NoDataOptions | undefined) {
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

export default status_overlay;

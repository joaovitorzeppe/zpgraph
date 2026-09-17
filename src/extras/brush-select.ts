/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import ZpgraphImport from "zpgraph";
import type { ZpgraphInstance } from "../internal-types";
import type { InteractionContext, InteractionModel } from "../types";
import type ZpgraphClass from "../zpgraph";
import * as utils from "../utils";

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  Plugins: Record<string, unknown> & { BrushSelect?: typeof BrushSelect };
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;
Zpgraph.Plugins = Zpgraph.Plugins || {};

export type BrushSelectResult = {
  xRange: [number, number];
  yRange?: [number, number];
};

export type BrushSelectOptions = {
  onSelect: (result: BrushSelectResult) => void;
  /** Start active (drag = select, not zoom). Default false. */
  active?: boolean;
  /** Also capture y range. Default false (x-only). */
  captureY?: boolean;
  fillStyle?: string;
};

/**
 * Opt-in brush tool: when active, drag selects a range and fires onSelect
 * instead of zooming.
 */
class BrushSelect {
  onSelect_: (result: BrushSelectResult) => void;
  active_: boolean;
  captureY_: boolean;
  fillStyle_: string;
  g_: ZpgraphInstance | null = null;
  savedModel_: InteractionModel | null | undefined = undefined;
  brushModel_: InteractionModel | null = null;

  constructor(opt_options: BrushSelectOptions) {
    this.onSelect_ = opt_options.onSelect;
    this.active_ = !!opt_options.active;
    this.captureY_ = !!opt_options.captureY;
    this.fillStyle_ = opt_options.fillStyle || "rgba(27, 107, 147, 0.25)";
  }

  toString() {
    return "BrushSelect Plugin";
  }

  activate(g: ZpgraphClass) {
    this.g_ = g as unknown as ZpgraphInstance;
    if (this.active_) {
      this.install_();
    }
    return {};
  }

  isActive() {
    return this.active_;
  }

  setActive(active: boolean) {
    if (this.active_ === active) {
      return;
    }
    this.active_ = active;
    if (!this.g_) {
      return;
    }
    if (active) {
      this.install_();
    } else {
      this.uninstall_();
    }
  }

  install_() {
    const g = this.g_!;
    if (this.savedModel_ === undefined) {
      this.savedModel_ = g.getOption("interactionModel") as InteractionModel;
    }
    this.brushModel_ = this.buildModel_();
    g.updateOptions({ interactionModel: this.brushModel_ }, true);
  }

  uninstall_() {
    const g = this.g_;
    if (!g) {
      return;
    }
    g.updateOptions({ interactionModel: this.savedModel_ ?? null }, true);
    this.savedModel_ = undefined;
  }

  buildModel_(): InteractionModel {
    return {
      mousedown: (
        event: MouseEvent,
        g: unknown,
        context: InteractionContext,
      ) => {
        const chart = g as ZpgraphInstance;
        if (event.button && event.button === 2) {
          return;
        }
        context.initializeMouseDown(event, g, context);
        const drag = context as InteractionContext & {
          isZooming?: boolean;
          dragStartX?: number;
          dragStartY?: number;
          dragEndX?: number;
          dragEndY?: number;
        };
        drag.isZooming = true;

        const mousemove = utils.coalesceFrames(((moveEvent: MouseEvent) => {
          drag.dragEndX = utils.dragGetX_(moveEvent, context);
          drag.dragEndY = utils.dragGetY_(moveEvent, context);
          const ctx = chart.canvas_ctx_;
          ctx.clearRect(0, 0, chart.width_, chart.height_);
          const x0 = Math.min(drag.dragStartX!, drag.dragEndX!);
          const x1 = Math.max(drag.dragStartX!, drag.dragEndX!);
          const area = chart.layout_.getPlotArea();
          let y0 = area.y;
          let h = area.h;
          if (this.captureY_) {
            y0 = Math.min(drag.dragStartY!, drag.dragEndY!);
            h = Math.abs(drag.dragEndY! - drag.dragStartY!);
          }
          ctx.fillStyle = this.fillStyle_;
          ctx.fillRect(x0, y0, x1 - x0, h);
        }) as (...args: unknown[]) => void);

        const mouseup = (upEvent: MouseEvent) => {
          mousemove.flush();
          utils.removeEvent(document, "mousemove", mousemove as EventListener);
          utils.removeEvent(document, "mouseup", mouseup as EventListener);
          drag.dragEndX = utils.dragGetX_(upEvent, context);
          drag.dragEndY = utils.dragGetY_(upEvent, context);
          chart.canvas_ctx_.clearRect(0, 0, chart.width_, chart.height_);

          const xA = chart.toDataXCoord(
            Math.min(drag.dragStartX!, drag.dragEndX!),
          );
          const xB = chart.toDataXCoord(
            Math.max(drag.dragStartX!, drag.dragEndX!),
          );
          if (xA == null || xB == null || Math.abs(xB - xA) < 1e-9) {
            return;
          }
          const result: BrushSelectResult = { xRange: [xA, xB] };
          if (this.captureY_) {
            const yTop = chart.toDataYCoord(
              Math.min(drag.dragStartY!, drag.dragEndY!),
            );
            const yBot = chart.toDataYCoord(
              Math.max(drag.dragStartY!, drag.dragEndY!),
            );
            if (yTop != null && yBot != null) {
              result.yRange = [Math.min(yTop, yBot), Math.max(yTop, yBot)];
            }
          }
          this.onSelect_(result);
        };

        chart.addAndTrackEvent(
          document,
          "mousemove",
          mousemove as EventListener,
        );
        chart.addAndTrackEvent(document, "mouseup", mouseup as EventListener);
      },
      // Keep dblclick reset available.
      dblclick: (_event: MouseEvent, g: unknown) => {
        (g as ZpgraphInstance).resetZoom();
      },
      willDestroyContextMyself: true,
    } as InteractionModel;
  }

  destroy() {
    if (this.active_) {
      this.uninstall_();
    }
    this.g_ = null;
  }
}

Zpgraph.Plugins.BrushSelect = BrushSelect;

export default BrushSelect;

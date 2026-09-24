/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type { ZpgraphInstance } from "../internal-types";
import type { InteractionContext, InteractionModel } from "../types";
import type ZpgraphClass from "../zpgraph";
import * as utils from "../utils";


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

const isInteractionModel = (v: unknown): v is InteractionModel =>
  typeof v === "object" && v !== null;

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
    this.g_ = g;
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
      const model = g.getOption("interactionModel");
      this.savedModel_ = isInteractionModel(model) ? model : null;
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
        g: ZpgraphInstance,
        context: InteractionContext,
      ) => {
        if (event.button && event.button === 2) {
          return;
        }
        context.initializeMouseDown(event, g, context);
        context.isZooming = true;

        const mousemove = utils.coalesceFrames((moveEvent: MouseEvent) => {
          context.dragEndX = utils.dragGetX_(moveEvent, context);
          context.dragEndY = utils.dragGetY_(moveEvent, context);
          const ctx = g.canvas_ctx_;
          ctx.clearRect(0, 0, g.width_, g.height_);
          const x0 = Math.min(context.dragStartX!, context.dragEndX);
          const x1 = Math.max(context.dragStartX!, context.dragEndX);
          const area = g.layout_.getPlotArea();
          let y0 = area.y;
          let h = area.h;
          if (this.captureY_) {
            y0 = Math.min(context.dragStartY!, context.dragEndY);
            h = Math.abs(context.dragEndY - context.dragStartY!);
          }
          ctx.fillStyle = this.fillStyle_;
          ctx.fillRect(x0, y0, x1 - x0, h);
        });

        const mouseup: EventListener = (rawUp) => {
          if (!(rawUp instanceof MouseEvent)) {
            return;
          }
          const upEvent = rawUp;
          mousemove.flush();
          utils.removeEvent(document, "mousemove", mousemove);
          utils.removeEvent(document, "mouseup", mouseup);
          context.dragEndX = utils.dragGetX_(upEvent, context);
          context.dragEndY = utils.dragGetY_(upEvent, context);
          g.canvas_ctx_.clearRect(0, 0, g.width_, g.height_);

          const xA = g.toDataXCoord(
            Math.min(context.dragStartX!, context.dragEndX),
          );
          const xB = g.toDataXCoord(
            Math.max(context.dragStartX!, context.dragEndX),
          );
          if (xA == null || xB == null || Math.abs(xB - xA) < 1e-9) {
            return;
          }
          const result: BrushSelectResult = { xRange: [xA, xB] };
          if (this.captureY_) {
            const yTop = g.toDataYCoord(
              Math.min(context.dragStartY!, context.dragEndY),
            );
            const yBot = g.toDataYCoord(
              Math.max(context.dragStartY!, context.dragEndY),
            );
            if (yTop != null && yBot != null) {
              result.yRange = [Math.min(yTop, yBot), Math.max(yTop, yBot)];
            }
          }
          this.onSelect_(result);
        };

        g.addAndTrackEvent(document, "mousemove", mousemove);
        g.addAndTrackEvent(document, "mouseup", mouseup);
      },
      // Keep dblclick reset available.
      dblclick: (_event: MouseEvent, g: ZpgraphInstance) => {
        g.resetZoom();
      },
      willDestroyContextMyself: true,
    };
  }

  destroy() {
    if (this.active_) {
      this.uninstall_();
    }
    this.g_ = null;
  }
}


export default BrushSelect;

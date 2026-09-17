/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import type {
  ChartDrawPluginEvent,
  LayoutPluginEvent,
  ZpgraphInstance,
} from "../internal-types";
import type {
  InteractionContext,
  InteractionModel,
  ToolbarOptions,
  ToolbarStyle,
  ToolbarTool,
} from "../types";
import { getChartClassNames, withClassNames } from "../class-names";
import { downloadDataUrl, downloadText, toCsv, toPng } from "../export-chart";
import ZpgraphInteraction from "../interaction-model";
import * as utils from "../utils";
import type Zpgraph from "../zpgraph";

const DEFAULT_TOOLS: ToolbarTool[] = [
  "zoomin",
  "zoomout",
  "pan",
  "reset",
  "downloadPng",
  "downloadCsv",
];

/** Top chrome so toolbar sits above the plot, not over series. */
const TOOLBAR_RESERVE_TOP = 36;

const DEFAULT_LABELS: Record<ToolbarTool, string> = {
  zoomin: "Zoom in",
  zoomout: "Zoom out",
  pan: "Pan",
  reset: "Reset",
  downloadPng: "PNG",
  downloadCsv: "CSV",
  copyCsv: "Copy CSV",
};

/** Compact default icons (inline SVG). Override via toolbar.icons. */
const DEFAULT_ICONS: Record<ToolbarTool, string> = {
  zoomin:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M21 21l-4.3-4.3"/></svg>',
  zoomout:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M21 21l-4.3-4.3"/></svg>',
  pan: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M7 7l-5 5 5 5M17 7l5 5-5 5"/></svg>',
  reset:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  downloadPng:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  downloadCsv:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
  copyCsv:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

class toolbar {
  el_: HTMLElement | null = null;
  panMode_ = false;
  /** Interaction model before pan — restored when pan turns off / reset. */
  savedModel_: InteractionModel | null | undefined = undefined;
  panModel_: InteractionModel | null = null;
  builtKey_ = "";

  toString() {
    return "Toolbar Plugin";
  }

  activate(_g: ZpgraphInstance) {
    return {
      layout: this.layout,
      didDrawChart: this.didDrawChart,
      clearChart: this.clearChart,
    };
  }

  layout(e: LayoutPluginEvent) {
    const opt = e.zpgraph.getOption("toolbar");
    if (!opt) {return;}
    e.reserveSpaceTop(TOOLBAR_RESERVE_TOP);
  }

  clearChart(_e: ChartDrawPluginEvent) {
    this.detach_();
  }

  didDrawChart(e: ChartDrawPluginEvent) {
    const g = e.zpgraph as unknown as Zpgraph;
    const opt = g.getOption("toolbar") as boolean | ToolbarOptions | undefined;
    if (!opt) {
      this.detach_();
      return;
    }

    const conf: ToolbarOptions = opt === true ? {} : opt;
    const tools = conf.tools?.length ? conf.tools : DEFAULT_TOOLS;
    const position = conf.position ?? "top-right";
    const key = JSON.stringify({
      tools,
      position,
      labels: conf.labels,
      titles: conf.titles,
      icons: Object.keys(conf.icons ?? {}),
      variant: conf.variant,
      className: conf.className,
      buttonClassName: conf.buttonClassName,
      style: conf.style,
      buttonStyle: conf.buttonStyle,
    });

    if (!this.el_) {
      this.el_ = document.createElement("div");
      this.el_.setAttribute("role", "toolbar");
      g.graphDiv.appendChild(this.el_);
    }

    const names = getChartClassNames(g);
    this.el_.className = withClassNames(
      `zpgraph-toolbar zpgraph-toolbar-${position}`,
      [names.toolbar, conf.className].filter(Boolean).join(" "),
    );
    applyToolbarStyle(this.el_, conf.style);

    if (this.builtKey_ !== key) {
      this.builtKey_ = key;
      this.el_.replaceChildren();
      for (const tool of tools) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = withClassNames(
          "zpgraph-toolbar-btn",
          [names.toolbarBtn, conf.buttonClassName].filter(Boolean).join(" "),
        );
        btn.dataset.tool = tool;
        applyToolbarStyle(btn, conf.buttonStyle);
        const label = conf.labels?.[tool] ?? DEFAULT_LABELS[tool];
        const title = conf.titles?.[tool] ?? label;
        btn.title = title;
        btn.setAttribute("aria-label", title);
        fillButtonContent(btn, tool, conf, label);
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          this.runTool_(g, tool);
          this.syncPanActive_();
        });
        this.el_.appendChild(btn);
      }
    } else {
      // Keep button classes/styles in sync when rebuild skipped.
      for (const btn of this.el_.querySelectorAll<HTMLButtonElement>(
        ".zpgraph-toolbar-btn",
      )) {
        btn.className = withClassNames(
          "zpgraph-toolbar-btn",
          [names.toolbarBtn, conf.buttonClassName].filter(Boolean).join(" "),
        );
        applyToolbarStyle(btn, conf.buttonStyle);
      }
    }

    this.ensureInteractionModel_(g);
    this.syncPanActive_();
  }

  syncPanActive_() {
    if (!this.el_) {return;}
    for (const btn of this.el_.querySelectorAll<HTMLButtonElement>(
      ".zpgraph-toolbar-btn",
    )) {
      btn.classList.toggle(
        "is-active",
        btn.dataset.tool === "pan" && this.panMode_,
      );
    }
  }

  /**
   * React/options may overwrite interactionModel. Keep pan on while active;
   * when pan is off, keep the saved (pre-pan) model applied.
   */
  ensureInteractionModel_(g: Zpgraph) {
    if (this.panMode_) {
      if (!this.panModel_) {this.panModel_ = createPanDragModel();}
      const current = g.getOption("interactionModel") as
        | InteractionModel
        | null
        | undefined;
      if (current === this.panModel_) {return;}
      if (current != null && current !== this.panModel_) {
        this.savedModel_ = current;
      }
      g.updateOptions({ interactionModel: this.panModel_ }, true);
      return;
    }

    if (this.savedModel_ === undefined) {return;}
    const current = g.getOption("interactionModel") as
      | InteractionModel
      | null
      | undefined;
    if (current === this.savedModel_) {return;}
    this.panModel_ = null;
    g.updateOptions({ interactionModel: this.savedModel_ ?? null }, true);
  }

  runTool_(g: Zpgraph, tool: ToolbarTool) {
    switch (tool) {
      case "zoomin":
        zoomBy(g, 0.7);
        break;
      case "zoomout":
        zoomBy(g, 1 / 0.7);
        break;
      case "pan":
        this.togglePan_(g);
        break;
      case "reset":
        this.panMode_ = false;
        this.panModel_ = null;
        if (this.savedModel_ !== undefined) {
          g.updateOptions({
            interactionModel: this.savedModel_ ?? null,
          });
          this.savedModel_ = undefined;
        }
        g.resetZoom();
        break;
      case "downloadPng":
        downloadDataUrl("zpgraph.png", toPng(g, { background: "#fff" }));
        break;
      case "downloadCsv":
        downloadText(
          "zpgraph.csv",
          toCsv(g, { visibleOnly: true, utf8Bom: true }),
          "text/csv;charset=utf-8",
        );
        break;
      case "copyCsv":
        void navigator.clipboard?.writeText(
          toCsv(g, { visibleOnly: true, utf8Bom: false }),
        );
        break;
    }
  }

  togglePan_(g: Zpgraph) {
    this.panMode_ = !this.panMode_;
    if (this.panMode_) {
      const current = g.getOption("interactionModel") as
        | InteractionModel
        | null
        | undefined;
      if (this.savedModel_ === undefined && current !== this.panModel_) {
        this.savedModel_ = current ?? null;
      }
      this.panModel_ = createPanDragModel();
      g.updateOptions({ interactionModel: this.panModel_ });
    } else {
      this.panModel_ = null;
      const restore =
        this.savedModel_ !== undefined
          ? this.savedModel_
          : ZpgraphInteraction.defaultModel;
      g.updateOptions({ interactionModel: restore ?? null });
    }
  }

  detach_() {
    this.el_?.remove();
    this.el_ = null;
    this.builtKey_ = "";
  }

  destroy() {
    this.detach_();
  }
}

const applyToolbarStyle = (
  el: HTMLElement,
  style: ToolbarStyle | undefined,
) => {
  if (!style) {return;}
  for (const [key, value] of Object.entries(style)) {
    el.style.setProperty(
      key.includes("-") ? key : camelToKebab(key),
      value,
    );
  }
};

const camelToKebab = (s: string) =>
  s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const fillButtonContent = (
  btn: HTMLButtonElement,
  tool: ToolbarTool,
  conf: ToolbarOptions,
  label: string,
) => {
  const custom = conf.icons?.[tool];
  if (typeof custom === "function") {
    btn.appendChild(custom());
    return;
  }
  if (typeof custom === "string") {
    if (custom.trim().startsWith("<")) {btn.innerHTML = custom;}
    else {btn.textContent = custom;}
    return;
  }
  if (conf.variant === "text") {
    btn.textContent = label;
    return;
  }
  // Default: icon + visually-hidden label for a11y (aria-label already set).
  btn.innerHTML = DEFAULT_ICONS[tool];
  const sr = document.createElement("span");
  sr.className = "zpgraph-sr-only";
  sr.textContent = label;
  btn.appendChild(sr);
};

/**
 * Pan-on-drag model with document-level move/up (same as default zoom model).
 * Replaces the stock dragIsPanInteractionModel which only listened on canvas.
 */
const createPanDragModel = (): InteractionModel =>
  ({
    mousedown: (event: MouseEvent, g: unknown, context: InteractionContext) => {
      const chart = g as ZpgraphInstance;
      if (event.button && event.button === 2) {return;}
      context.initializeMouseDown(event, g, context);
      ZpgraphInteraction.startPan(event, g, context);

      const drag = context as InteractionContext & {
        isPanning?: boolean;
        destroy?: () => void;
      };
      const mousemove = utils.coalesceFrames(
        ((moveEvent: MouseEvent) => {
          if (drag.isPanning) {
            ZpgraphInteraction.movePan(moveEvent, g, context);
          }
        }) as (...args: unknown[]) => void,
      );
      const mouseup = (upEvent: MouseEvent)  => {
        mousemove.flush();
        if (drag.isPanning) {
          ZpgraphInteraction.endPan(upEvent, g, context);
        }
        utils.removeEvent(document, "mousemove", mousemove as EventListener);
        utils.removeEvent(document, "mouseup", mouseup as EventListener);
        drag.destroy?.();
      };
      chart.addAndTrackEvent(document, "mousemove", mousemove as EventListener);
      chart.addAndTrackEvent(document, "mouseup", mouseup as EventListener);
    },
    willDestroyContextMyself: true,
  }) as InteractionModel;

const zoomBy = (g: Zpgraph, factor: number) => {
  const [x0, x1] = g.xAxisRange();
  const mid = (x0 + x1) / 2;
  const half = ((x1 - x0) / 2) * factor;
  g.updateOptions({ dateWindow: [mid - half, mid + half] });
};

export default toolbar;

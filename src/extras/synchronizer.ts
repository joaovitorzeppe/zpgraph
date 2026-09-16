/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Synchronize zooming and/or selections between a set of zpgraph.
 *
 * Usage:
 *
 *   const g1 = new Zpgraph(...),
 *       g2 = new Zpgraph(...),
 *       ...;
 *   const sync = Zpgraph.synchronize(g1, g2, ...);
 *   // charts are now synchronized
 *   sync.detach();
 *   // charts are no longer synchronized
 *
 * You can set options using the last parameter, for example:
 *
 *   const sync = Zpgraph.synchronize(g1, g2, g3, {
 *      selection: true,
 *      zoom: true
 *   });
 *
 * The default is to synchronize both of these.
 *
 * Instead of passing one Zpgraph object as each parameter, you may also pass an
 * array of zpgraph:
 *
 *   const sync = Zpgraph.synchronize([g1, g2, g3], {
 *      selection: false,
 *      zoom: true
 *   });
 *
 * You may also set `range: false` if you wish to only sync the x-axis.
 * The `range` option has no effect unless `zoom` is true (the default).
 */

import ZpgraphImport from "zpgraph";
import type { ZpgraphInstance } from "../internal-types";
import type { Point, ZpgraphOptions } from "../types";

interface SyncOptions {
  selection: boolean;
  zoom: boolean;
  range: boolean;
}

interface StoredCallbacks {
  drawCallback?: (...args: unknown[]) => void;
  highlightCallback?: (...args: unknown[]) => void;
  unhighlightCallback?: (...args: unknown[]) => void;
  [key: string]: ((...args: unknown[]) => void) | undefined;
}

type ZpgraphExtrasHost = typeof ZpgraphImport & {
  synchronize: typeof synchronize;
};

const Zpgraph = ZpgraphImport as ZpgraphExtrasHost;

const arraysAreEqual = <T>(a: T[] | unknown, b: T[] | unknown): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  let i = a.length;
  if (i !== b.length) return false;
  while (i--) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const attachZoomHandlers = (
  gs: ZpgraphInstance[],
  syncOpts: SyncOptions,
  prevCallbacks: StoredCallbacks[],
) => {
  let block = false;
  for (let i = 0; i < gs.length; i++) {
    let g = gs[i]!;
    g.updateOptions(
      {
        drawCallback: function synchronizer_drawCallback(
          me: unknown,
          initial: boolean,
        ) {
          const chart = me as ZpgraphInstance;
          if (block || initial) {
            // call the user’s drawCallback even if we are blocked
            for (let j = 0; j < gs.length; j++) {
              if (gs[j] === chart) {
                prevCallbacks[j]?.drawCallback?.(chart, initial);
                break;
              }
            }
            return;
          }

          block = true;

          let opts: Partial<ZpgraphOptions> = {
            dateWindow: chart.xAxisRange(),
          };
          if (syncOpts.range) opts.valueRange = chart.yAxisRange();

          for (let j = 0; j < gs.length; j++) {
            if (gs[j] === chart) {
              prevCallbacks[j]?.drawCallback?.(chart, initial);
              continue;
            }

            // If X-zoom differs, update
            let update = !arraysAreEqual(
              opts.dateWindow,
              gs[j]!.getOption("dateWindow") as [number, number] | null,
            );
            // If Y-zoom differs and syncing, update
            if (
              !update &&
              syncOpts.range &&
              !arraysAreEqual(
                opts.valueRange,
                gs[j]!.getOption("valueRange") as
                  | [number | null, number | null]
                  | null,
              )
            )
              update = true;
            // If about to update, but not syncing Y-zoom, pass current value
            if (update && !syncOpts.range)
              opts.valueRange = gs[j]!.yAxisRange();

            if (update) gs[j]!.updateOptions(opts);
          }
          block = false;
        },
      },
      true /* no need to redraw */,
    );
  }
};

const attachSelectionHandlers = (
  gs: ZpgraphInstance[],
  prevCallbacks: StoredCallbacks[],
) => {
  let block = false;
  for (let i = 0; i < gs.length; i++) {
    let g = gs[i]!;

    g.updateOptions(
      {
        highlightCallback: (
          event: MouseEvent,
          x: number,
          points: Point[],
          row: number,
          seriesName: string,
        ) => {
          if (block) return;
          block = true;
          for (let j = 0; j < gs.length; j++) {
            if (j === i) {
              prevCallbacks[j]?.highlightCallback?.(
                event,
                x,
                points,
                row,
                seriesName,
              );
              continue;
            }
            let idx = gs[j]!.getRowForX(x);
            if (idx !== null) {
              gs[j]!.setSelection(idx, seriesName, undefined, true);
            }
          }
          block = false;
        },
        unhighlightCallback: (event: MouseEvent) => {
          if (block) return;
          block = true;
          for (let j = 0; j < gs.length; j++) {
            if (j === i) {
              prevCallbacks[j]?.unhighlightCallback?.(event);
              continue;
            }
            gs[j]!.clearSelection();
          }
          block = false;
        },
      },
      true /* no need to redraw */,
    );
  }
};

const parseSyncOpts = (obj: object, opts: SyncOptions) => {
  const OPTIONS = ["selection", "zoom", "range"] as const;
  for (const optName of OPTIONS) {
    if (Object.hasOwn(obj, optName)) {
      opts[optName] = (obj as SyncOptions)[optName];
    }
  }
};

const synchronize = function synchronize(/* zpgraph..., opts */) {
  if (arguments.length === 0) {
    throw new Error(
      "Invalid invocation of Zpgraph.synchronize(). Need >= 1 argument.",
    );
  }

  let opts: SyncOptions | null = {
    selection: true,
    zoom: true,
    range: true,
  };
  let zpgraph: ZpgraphInstance[] | null = [];
  let prevCallbacks: StoredCallbacks[] | null = [];

  if (arguments[0] instanceof ZpgraphImport) {
    // Arguments are Zpgraph objects.
    let i = 0;
    for (; i < arguments.length; i++) {
      if (arguments[i] instanceof ZpgraphImport) {
        zpgraph.push(arguments[i] as ZpgraphInstance);
      } else {
        break;
      }
    }
    if (i < arguments.length - 1) {
      throw new Error(
        "Invalid invocation of Zpgraph.synchronize(). " +
          "All but the last argument must be Zpgraph objects.",
      );
    } else if (i === arguments.length - 1) {
      parseSyncOpts(arguments[arguments.length - 1] as object, opts);
    }
  } else if ((arguments[0] as ZpgraphInstance[]).length) {
    // Invoked w/ list of zpgraph, options
    for (let i = 0; i < (arguments[0] as ZpgraphInstance[]).length; i++) {
      zpgraph.push((arguments[0] as ZpgraphInstance[])[i]!);
    }
    if (arguments.length === 2) {
      parseSyncOpts(arguments[1] as object, opts);
    } else if (arguments.length > 2) {
      throw new Error(
        "Invalid invocation of Zpgraph.synchronize(). " +
          "Expected two arguments: array and optional options argument.",
      );
    } // otherwise arguments.length == 1, which is fine.
  } else {
    throw new Error(
      "Invalid invocation of Zpgraph.synchronize(). " +
        "First parameter must be either Zpgraph or list of Zpgraph.",
    );
  }

  if (zpgraph.length < 2) {
    throw new Error(
      "Invalid invocation of Zpgraph.synchronize(). " +
        "Need two or more zpgraph to synchronize.",
    );
  }

  const charts = zpgraph;
  let syncOpts = opts;
  let callbacks = prevCallbacks;

  let readycount = charts.length;
  for (let i = 0; i < charts.length; i++) {
    let g = charts[i]!;
    g.ready(function onReady_() {
      if (--readycount === 0) {
        // store original callbacks
        for (let j = 0; j < charts.length; j++) {
          if (!callbacks![j]) {
            callbacks![j] = {};
          }
          const savedDraw = charts[j]!.getFunctionOption("drawCallback");
          if (savedDraw) callbacks![j]!.drawCallback = savedDraw;
          const savedHighlight =
            charts[j]!.getFunctionOption("highlightCallback");
          if (savedHighlight) callbacks![j]!.highlightCallback = savedHighlight;
          const savedUnhighlight = charts[j]!.getFunctionOption(
            "unhighlightCallback",
          );
          if (savedUnhighlight)
            callbacks![j]!.unhighlightCallback = savedUnhighlight;
        }

        // Listen for draw, highlight, unhighlight callbacks.
        if (syncOpts.zoom) {
          attachZoomHandlers(charts, syncOpts, callbacks!);
        }

        if (syncOpts.selection) {
          attachSelectionHandlers(charts, callbacks!);
        }
      }
    });
  }

  return {
    detach: function detach() {
      if (!zpgraph || !opts || !prevCallbacks) {
        throw new Error("Zpgraph.synchronize(): already detached.");
      }
      for (let i = 0; i < zpgraph.length; i++) {
        let g = zpgraph[i]!;
        if (opts.zoom) {
          g.updateOptions({
            drawCallback: prevCallbacks[i]?.drawCallback ?? null,
          } as Partial<ZpgraphOptions>);
        }
        if (opts.selection) {
          g.updateOptions({
            highlightCallback: prevCallbacks[i]?.highlightCallback ?? null,
            unhighlightCallback: prevCallbacks[i]?.unhighlightCallback ?? null,
          } as Partial<ZpgraphOptions>);
        }
      }
      // release references & make subsequent calls throw.
      zpgraph = null;
      opts = null;
      prevCallbacks = null;
    },
  };
};

Zpgraph.synchronize = synchronize;

export default synchronize;
export { synchronize };

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

import { Zpgraph as ZpgraphImport } from "zpgraph";
import type { ZpgraphInstance } from "../internal-types";
import type { Point, ZpgraphOptions } from "../types";

interface SyncOptions {
  selection: boolean;
  zoom: boolean;
  range: boolean;
}

interface StoredCallbacks {
  drawCallback?: ZpgraphOptions["drawCallback"];
  highlightCallback?: ZpgraphOptions["highlightCallback"];
  unhighlightCallback?: ZpgraphOptions["unhighlightCallback"];
}

const arraysAreEqual = (a: unknown, b: unknown): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return false;
  }
  let i = a.length;
  if (i !== b.length) {
    return false;
  }
  while (i--) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

const rangesEqual = (
  a: readonly number[] | null,
  b: readonly number[] | null,
): boolean => {
  if (a === null || b === null) {
    return a === null && b === null;
  }
  return arraysAreEqual(a, b);
};

const isDrawCallback = (
  v: unknown,
): v is NonNullable<ZpgraphOptions["drawCallback"]> => typeof v === "function";

const isHighlightCallback = (
  v: unknown,
): v is NonNullable<ZpgraphOptions["highlightCallback"]> =>
  typeof v === "function";

const isUnhighlightCallback = (
  v: unknown,
): v is NonNullable<ZpgraphOptions["unhighlightCallback"]> =>
  typeof v === "function";

const attachZoomHandlers = (
  gs: ZpgraphInstance[],
  syncOpts: SyncOptions,
  prevCallbacks: StoredCallbacks[],
) => {
  const state = { block: false };
  gs.forEach((g) => {
    g.updateOptions(
      {
        drawCallback(me: ZpgraphInstance, initial: boolean) {
          if (state.block || initial) {
            // call the user’s drawCallback even if we are blocked
            for (let j = 0; j < gs.length; j++) {
              if (gs[j] === me) {
                prevCallbacks[j]?.drawCallback?.(me, initial);
                break;
              }
            }
            return;
          }

          state.block = true;

          const xRange = me.xAxisRange();
          const yRange = me.yAxisRange();
          const opts: Partial<ZpgraphOptions> = {
            dateWindow: [xRange[0], xRange[1]],
          };
          if (syncOpts.range) {
            opts.valueRange = yRange;
          }

          for (let j = 0; j < gs.length; j++) {
            if (gs[j] === me) {
              prevCallbacks[j]?.drawCallback?.(me, initial);
              continue;
            }

            // dateWindow null means full extremes, so compare live ranges.
            const peer = gs[j]!;
            let update = !rangesEqual(xRange, peer.xAxisRange());
            if (!update && syncOpts.range) {
              update = !rangesEqual(yRange, peer.yAxisRange());
            }
            // If about to update, but not syncing Y-zoom, pass current value
            if (update && !syncOpts.range) {
              opts.valueRange = peer.yAxisRange();
            }

            if (update) {
              gs[j]!.updateOptions(opts);
            }
          }
          state.block = false;
        },
      },
      true /* no need to redraw */,
    );
  });
};

const attachSelectionHandlers = (
  gs: ZpgraphInstance[],
  prevCallbacks: StoredCallbacks[],
) => {
  const state = { block: false };
  gs.forEach((g, i) => {
    g.updateOptions(
      {
        highlightCallback: (
          event: MouseEvent,
          x: number,
          points: Point[],
          row: number,
          seriesName: string,
          chart: ZpgraphInstance,
        ) => {
          if (state.block) {
            return;
          }
          state.block = true;
          for (let j = 0; j < gs.length; j++) {
            if (j === i) {
              prevCallbacks[j]?.highlightCallback?.(
                event,
                x,
                points,
                row,
                seriesName,
                chart,
              );
              continue;
            }
            const idx = gs[j]!.getRowForX(x);
            if (idx !== null) {
              gs[j]!.setSelection(idx, seriesName, undefined, true);
            }
          }
          state.block = false;
        },
        unhighlightCallback: (event: MouseEvent, chart: ZpgraphInstance) => {
          if (state.block) {
            return;
          }
          state.block = true;
          for (let j = 0; j < gs.length; j++) {
            if (j === i) {
              prevCallbacks[j]?.unhighlightCallback?.(event, chart);
              continue;
            }
            gs[j]!.clearSelection();
          }
          state.block = false;
        },
      },
      true /* no need to redraw */,
    );
  });
};

const parseSyncOpts = (obj: object, opts: SyncOptions) => {
  const OPTIONS = ["selection", "zoom", "range"] as const;
  for (const optName of OPTIONS) {
    if (!Object.hasOwn(obj, optName)) {
      continue;
    }
    const v = Reflect.get(obj, optName);
    if (typeof v === "boolean") {
      opts[optName] = v;
    }
  }
};

const isZpgraphInstance = (v: unknown): v is ZpgraphInstance =>
  v instanceof ZpgraphImport;

const synchronize = (...args: unknown[]) => {
  if (args.length === 0) {
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

  if (isZpgraphInstance(args[0])) {
    // Arguments are Zpgraph objects.
    let i = 0;
    for (; i < args.length; i++) {
      const arg = args[i];
      if (isZpgraphInstance(arg)) {
        zpgraph.push(arg);
      } else {
        break;
      }
    }
    if (i < args.length - 1) {
      throw new Error(
        "Invalid invocation of Zpgraph.synchronize(). " +
          "All but the last argument must be Zpgraph objects.",
      );
    } else if (i === args.length - 1) {
      const last = args[args.length - 1];
      if (last !== null && typeof last === "object") {
        parseSyncOpts(last, opts);
      }
    }
  } else if (Array.isArray(args[0]) && args[0].length) {
    // Invoked w/ list of zpgraph, options
    for (const item of args[0]) {
      if (isZpgraphInstance(item)) {
        zpgraph.push(item);
      }
    }
    if (args.length === 2) {
      const maybeOpts = args[1];
      if (maybeOpts !== null && typeof maybeOpts === "object") {
        parseSyncOpts(maybeOpts, opts);
      }
    } else if (args.length > 2) {
      throw new Error(
        "Invalid invocation of Zpgraph.synchronize(). " +
          "Expected two arguments: array and optional options argument.",
      );
    } // otherwise args.length == 1, which is fine.
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
  const syncOpts = opts;
  const callbacks = prevCallbacks;
  let attached = false;

  const readyState = { readycount: charts.length };
  charts.forEach((g) => {
    g.ready(() => {
      if (--readyState.readycount === 0) {
        // store original callbacks
        for (let j = 0; j < charts.length; j++) {
          if (!callbacks[j]) {
            callbacks[j] = {};
          }
          const saved = callbacks[j]!;
          const chart = charts[j]!;
          const drawOpt = chart.getOption("drawCallback");
          const highlightOpt = chart.getOption("highlightCallback");
          const unhighlightOpt = chart.getOption("unhighlightCallback");
          saved.drawCallback = isDrawCallback(drawOpt) ? drawOpt : undefined;
          saved.highlightCallback = isHighlightCallback(highlightOpt)
            ? highlightOpt
            : undefined;
          saved.unhighlightCallback = isUnhighlightCallback(unhighlightOpt)
            ? unhighlightOpt
            : undefined;
        }

        if (syncOpts.zoom) {
          attachZoomHandlers(charts, syncOpts, callbacks);
        }

        if (syncOpts.selection) {
          attachSelectionHandlers(charts, callbacks);
        }
        attached = syncOpts.zoom || syncOpts.selection;
      }
    });
  });

  return {
    detach() {
      if (!zpgraph || !opts || !prevCallbacks) {
        throw new Error("Zpgraph.synchronize(): already detached.");
      }
      if (attached) {
        for (let i = 0; i < zpgraph.length; i++) {
          const g = zpgraph[i]!;
          if (opts.zoom) {
            const restore: Partial<ZpgraphOptions> = {};
            Reflect.set(
              restore,
              "drawCallback",
              prevCallbacks[i]?.drawCallback ?? null,
            );
            g.updateOptions(restore);
          }
          if (opts.selection) {
            const restore: Partial<ZpgraphOptions> = {};
            Reflect.set(
              restore,
              "highlightCallback",
              prevCallbacks[i]?.highlightCallback ?? null,
            );
            Reflect.set(
              restore,
              "unhighlightCallback",
              prevCallbacks[i]?.unhighlightCallback ?? null,
            );
            g.updateOptions(restore);
          }
        }
      }
      // release references & make subsequent calls throw.
      zpgraph = null;
      opts = null;
      prevCallbacks = null;
    },
  };
};


class Synchronizer {
  private handle: { detach: () => void };

  constructor(...args: unknown[]) {
    this.handle = synchronize(...args);
  }

  detach() {
    this.handle.detach();
  }
}

export default synchronize;
export { synchronize, Synchronizer };

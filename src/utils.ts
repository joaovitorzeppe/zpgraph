"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * @fileoverview This file contains utility functions used by zpgraph. These
 * are typically static (i.e. not related to any particular zpgraph). Examples
 * include date/time formatting functions, basic algorithms (e.g. binary
 * search) and generic DOM-manipulation functions.
 */

/*global Zpgraph:false, Node:false */

import { Granularity } from "./granularity";
import { log } from "./logger";
import type { DrawPointCallback, InteractionContext, Point } from "./types";
import type { OptionsGetter } from "./internal-types";

/** True for null, undefined and values that are not a finite number. */
export const isNullUndefinedOrNaN = (num: unknown): boolean => {
  if (typeof num === "number") {
    return Number.isNaN(num);
  }
  if (typeof num === "string") {
    return Number.isNaN(parseFloat(num));
  }
  return true;
};

/** Date field accessors for local or UTC calendar math. */
export interface DateAccessors {
  getFullYear: (d: Date) => number;
  getMonth: (d: Date) => number;
  getDate: (d: Date) => number;
  getHours: (d: Date) => number;
  getMinutes: (d: Date) => number;
  getSeconds: (d: Date) => number;
  getMilliseconds: (d: Date) => number;
  getDay: (d: Date) => number;
  makeDate: (
    y: number,
    m: number,
    d: number,
    hh: number,
    mm: number,
    ss: number,
    ms: number,
  ) => Date;
}

/** Page coords from MouseEvent / Touch / legacy drag events. */
export type PageCoordEvent = Event | { pageX?: number; pageY?: number };

/** @private */
export const type = (o: unknown): string => {
  return o === null ? "null" : typeof o;
};

/**
 * @throws {Error} if series labels (indices 1..) contain duplicates.
 * @param labels Full labels array; index 0 is the x-axis column name.
 */
export const validateSeriesLabels = (labels: string[]) => {
  const seen = new Set<string>();
  for (let i = 1; i < labels.length; i++) {
    const name = labels[i]!;
    if (seen.has(name)) {
      throw new Error(
        'Duplicate series label "' +
          name +
          '" in labels option. Series names must be unique.',
      );
    }
    seen.add(name);
  }
};

export const LOG_SCALE = 10;
export const LN_TEN = Math.log(LOG_SCALE);

/** Half-pixel up for crisp canvas strokes. */
export const halfUp = (x: number) => Math.round(x) + 0.5;

/** Half-pixel down for crisp canvas strokes. */
export const halfDown = (y: number) => Math.round(y) - 0.5;

/**
 * @private
 * @param x * */
export const log10 = (x: number): number => {
  return Math.log(x) / LN_TEN;
};

/**
 * @private
 *
 * @param pct * */
export const logRangeFraction = (
  r0: number,
  r1: number,
  pct: number,
): number => {
  // Computing the inverse of toPercentXCoord. The function was arrived at with
  // the following steps:
  //
  // Original calcuation:
  // pct = (log(x) - log(xRange[0])) / (log(xRange[1]) - log(xRange[0]));
  //
  // Multiply both sides by the right-side denominator.
  // pct * (log(xRange[1] - log(xRange[0]))) = log(x) - log(xRange[0])
  //
  // add log(xRange[0]) to both sides
  // log(xRange[0]) + (pct * (log(xRange[1]) - log(xRange[0]))) = log(x);
  //
  // Swap both sides of the equation,
  // log(x) = log(xRange[0]) + (pct * (log(xRange[1]) - log(xRange[0])))
  //
  // Use both sides as the exponent in 10^exp and we're done.
  // x = 10 ^ (log(xRange[0]) + (pct * (log(xRange[1]) - log(xRange[0]))))

  const logr0 = log10(r0);
  const logr1 = log10(r1);
  const exponent = logr0 + pct * (logr1 - logr0);
  const value = Math.pow(LOG_SCALE, exponent);
  return value;
};

/** A dotted line stroke pattern. */
export const DOTTED_LINE = [2, 2];
/** A dashed line stroke pattern. */
export const DASHED_LINE = [7, 3];
/** A dot dash stroke pattern. */
export const DOT_DASH_LINE = [7, 2, 2, 2];

// Directions for panning and zooming. Use bit operations when combined
// values are possible.
export const HORIZONTAL = 1;
export const VERTICAL = 2;

/**
 * Return the 2d context for a zpgraph canvas.
 *
 * This method is only exposed for the sake of replacing the function in
 * automated tests.
 * @private
 */
export const getContext = (
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Zpgraph: this browser has no 2d canvas context.");
  }
  return ctx;
};

/**
 * EventListener options
 */
const _eventListenerOptions = (eventType: string) => {
  return eventType === "touchstart" || eventType === "touchmove"
    ? {
        capture: false,
        passive: true,
      }
    : false;
};

/**
 * Add an event handler.
 * @param elem The element to add the event to.
 * @param type The type of the event, e.g. 'click' or 'mousemove'.
 * @param fn The function to call
 *     on the event. The function takes one parameter: the event object.
 * @private
 */
/** Handlers accepted by addEvent/removeEvent (DOM + coalesced wrappers). */
type BivariantListener = {
  // Method params are bivariant — MouseEvent handlers stay EventListener-safe.
  bivarianceHack(event: Event): void;
}["bivarianceHack"];

export type DomEventHandler =
  | BivariantListener
  | EventListenerObject
  | (BivariantListener & { flush(): void; cancel(): void });

export const addEvent = (
  elem: EventTarget,
  eventType: string,
  fn: DomEventHandler,
) => {
  elem.addEventListener(eventType, fn, _eventListenerOptions(eventType));
};

/**
 * Remove an event handler.
 * @param elem The element to remove the event from.
 * @param type The type of the event, e.g. 'click' or 'mousemove'.
 * @param fn The function to call
 *     on the event. The function takes one parameter: the event object.
 */
export const removeEvent = (
  elem: EventTarget,
  eventType: string,
  fn: DomEventHandler | null | undefined,
) => {
  if (!fn) {
    return;
  }
  elem.removeEventListener(eventType, fn, _eventListenerOptions(eventType));
};

/**
 * Cancels further processing of an event (prevent default + stop bubbling).
 * @param e The event whose normal behavior should be canceled.
 * @private
 */
export const cancelEvent = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
};

/**
 * Convert hsv values to an rgb(r,g,b) string. Taken from MochiKit.Color. This
 * is used to generate default series colors which are evenly spaced on the
 * color wheel.
 * @param hue Range is 0.0-1.0.
 * @param saturation Range is 0.0-1.0.
 * @param value Range is 0.0-1.0.
 * @return "rgb(r,g,b)" where r, g and b range from 0-255.
 * @private
 */
export const hsvToRGB = (
  hue: number,
  saturation: number,
  value: number,
): string => {
  let red = 0;
  let green = 0;
  let blue = 0;
  if (saturation === 0) {
    red = value;
    green = value;
    blue = value;
  } else {
    const i = Math.floor(hue * 6);
    const f = hue * 6 - i;
    const p = value * (1 - saturation);
    const q = value * (1 - saturation * f);
    const t = value * (1 - saturation * (1 - f));
    switch (i) {
      case 1:
        red = q;
        green = value;
        blue = p;
        break;
      case 2:
        red = p;
        green = value;
        blue = t;
        break;
      case 3:
        red = p;
        green = q;
        blue = value;
        break;
      case 4:
        red = t;
        green = p;
        blue = value;
        break;
      case 5:
        red = value;
        green = p;
        blue = q;
        break;
      case 6: // fall through
      case 0:
        red = value;
        green = t;
        blue = p;
        break;
    }
  }
  red = Math.floor(255 * red + 0.5);
  green = Math.floor(255 * green + 0.5);
  blue = Math.floor(255 * blue + 0.5);
  return "rgb(" + red + "," + green + "," + blue + ")";
};

/**
 * Find the coordinates of an object relative to the top left of the page.
 * @private
 * @private
 */
export const findPos = (obj: Element) => {
  const p = obj.getBoundingClientRect();
  return {
    x: p.left + window.pageXOffset,
    y: p.top + window.pageYOffset,
  };
};

/**
 * Returns the x-coordinate of the event in a coordinate system where the
 * top-left corner of the page (not the window) is (0,0).
 * Taken from MochiKit.Signal
 * @private
 */
const pageCoord = (e: PageCoordEvent, key: "pageX" | "pageY"): number => {
  const v = Reflect.get(e, key);
  return typeof v === "number" && v >= 0 ? v : 0;
};

export const pageX = (e: PageCoordEvent): number => pageCoord(e, "pageX");

/**
 * Returns the y-coordinate of the event in a coordinate system where the
 * top-left corner of the page (not the window) is (0,0).
 * Taken from MochiKit.Signal
 * @private
 */
export const pageY = (e: PageCoordEvent): number => pageCoord(e, "pageY");

/**
 * Converts page the x-coordinate of the event to pixel x-coordinates on the
 * canvas (i.e. DOM Coords).
 * @param e Drag event.
 * @param context Interaction context object.
 * @return The amount by which the drag has moved to the right.
 */
export const dragGetX_ = (
  e: PageCoordEvent,
  context: InteractionContext,
): number => {
  return pageX(e) - context.px;
};

/**
 * Converts page the y-coordinate of the event to pixel y-coordinates on the
 * canvas (i.e. DOM Coords).
 * @param e Drag event.
 * @param context Interaction context object.
 * @return The amount by which the drag has moved down.
 */
export const dragGetY_ = (
  e: PageCoordEvent,
  context: InteractionContext,
): number => {
  return pageY(e) - context.py;
};

/**
 * This returns true unless the parameter is 0, null, undefined or NaN.
 *
 * @param x The number to consider.
 * @return Whether the number is non-zero and not NaN.
 * @private
 */
export const isNonZeroNonNan = (x: unknown): boolean => {
  return Boolean(x) && !Number.isNaN(Number(x));
};

/** @deprecated Prefer {@link isNonZeroNonNan}. Kept for API compatibility. */
export const isOK = isNonZeroNonNan;

/**
 * @param p The point to consider; valid points are {x, y} objects
 * @param opt_allowNaNY Treat point with y=NaN as valid
 * @return Whether the point has numeric x and y.
 * @private
 */
export const isValidPoint = (
  p: Partial<Point> | null | undefined,
  opt_allowNaNY?: boolean,
): boolean => {
  if (!p) {
    return false;
  } // null or undefined object
  if (p.yval === null) {
    return false;
  } // missing point
  if (p.x === null || p.x === undefined) {
    return false;
  }
  if (p.y === null || p.y === undefined) {
    return false;
  }
  if (isNaN(p.x) || (!opt_allowNaNY && isNaN(p.y))) {
    return false;
  }
  return true;
};

/**
 * Number formatting function which mimics the behavior of %g in printf, i.e.
 * either exponential or fixed format (without trailing 0s) is used depending on
 * the length of the generated string.  The advantage of this format is that
 * there is a predictable upper bound on the resulting string length,
 * significant figures are not dropped, and normal numbers are not displayed in
 * exponential notation.
 *
 * NOTE: JavaScript's native toPrecision() is NOT a drop-in replacement for %g.
 * It creates strings which are too long for absolute values between 10^-4 and
 * 10^-6, e.g. '0.00001' instead of '1e-5'. See tests/number-format.html for
 * output examples.
 *
 * @param x The number to format
 * @param opt_precision The precision to use, default 2.
 * @return A string formatted like %g in printf.  The max generated
 *                  string length should be precision + 6 (e.g 1.123e+300).
 */
export const floatFormat = (x: number, opt_precision?: number): string => {
  // Avoid invalid precision values; [1, 21] is the valid range.
  const p = Math.min(Math.max(1, opt_precision || 2), 21);

  // This is deceptively simple.  The actual algorithm comes from:
  //
  // Max allowed length = p + 4
  // where 4 comes from 'e+n' and '.'.
  //
  // Length of fixed format = 2 + y + p
  // where 2 comes from '0.' and y = # of leading zeroes.
  //
  // Equating the two and solving for y yields y = 2, or 0.00xxxx which is
  // 1.0e-3.
  //
  // Since the behavior of toPrecision() is identical for larger numbers, we
  // don't have to worry about the other bound.
  //
  // Finally, the argument for toExponential() is the number of trailing digits,
  // so we take off 1 for the value before the '.'.
  return Math.abs(x) < 1.0e-3 && x !== 0.0
    ? x.toExponential(p - 1)
    : x.toPrecision(p);
};

/**
 * Converts '9' to '09' (useful for dates)
 * @private
 */
export const zeropad = (x: number): string => {
  if (x < 10) {
    return "0" + x;
  }
  return "" + x;
};

/**
 * Date accessors to get the parts of a calendar date (year, month,
 * day, hour, minute, second and millisecond) according to local time,
 * and factory method to call the Date constructor with an array of arguments.
 */
export const DateAccessorsLocal: DateAccessors = {
  getFullYear: (d: Date) => d.getFullYear(),
  getMonth: (d: Date) => d.getMonth(),
  getDate: (d: Date) => d.getDate(),
  getHours: (d: Date) => d.getHours(),
  getMinutes: (d: Date) => d.getMinutes(),
  getSeconds: (d: Date) => d.getSeconds(),
  getMilliseconds: (d: Date) => d.getMilliseconds(),
  getDay: (d: Date) => d.getDay(),
  makeDate(
    y: number,
    m: number,
    d: number,
    hh: number,
    mm: number,
    ss: number,
    ms: number,
  ) {
    return new Date(y, m, d, hh, mm, ss, ms);
  },
};

/**
 * Date accessors to get the parts of a calendar date (year, month,
 * day of month, hour, minute, second and millisecond) according to UTC time,
 * and factory method to call the Date constructor with an array of arguments.
 */
export const DateAccessorsUTC: DateAccessors = {
  getFullYear: (d: Date) => d.getUTCFullYear(),
  getMonth: (d: Date) => d.getUTCMonth(),
  getDate: (d: Date) => d.getUTCDate(),
  getHours: (d: Date) => d.getUTCHours(),
  getMinutes: (d: Date) => d.getUTCMinutes(),
  getSeconds: (d: Date) => d.getUTCSeconds(),
  getMilliseconds: (d: Date) => d.getUTCMilliseconds(),
  getDay: (d: Date) => d.getUTCDay(),
  makeDate(
    y: number,
    m: number,
    d: number,
    hh: number,
    mm: number,
    ss: number,
    ms: number,
  ) {
    return new Date(Date.UTC(y, m, d, hh, mm, ss, ms));
  },
};

/**
 * Return a string version of the hours, minutes and seconds portion of a date.
 * @param hh The hours (from 0-23)
 * @param mm The minutes (from 0-59)
 * @param ss The seconds (from 0-59)
 * @return A time of the form "HH:MM" or "HH:MM:SS"
 * @private
 */
export const hmsString_ = (
  hh: number,
  mm: number,
  ss: number,
  ms: number,
): string => {
  let ret = zeropad(hh) + ":" + zeropad(mm);
  if (ss) {
    ret += ":" + zeropad(ss);
    if (ms) {
      const str = "" + ms;
      ret += "." + ("000" + str).slice(str.length);
    }
  }
  return ret;
};

/**
 * Convert a JS date (millis since epoch) to a formatted string.
 * @param time The JavaScript time value (ms since epoch)
 * @param utc Whether output UTC or local time
 * @return A date of one of these forms:
 *     "YYYY/MM/DD", "YYYY/MM/DD HH:MM" or "YYYY/MM/DD HH:MM:SS"
 * @private
 */
export const dateString_ = (time: number, utc: boolean): string => {
  const accessors = utc ? DateAccessorsUTC : DateAccessorsLocal;
  const date = new Date(time);
  const y = accessors.getFullYear(date);
  const m = accessors.getMonth(date);
  const d = accessors.getDate(date);
  const hh = accessors.getHours(date);
  const mm = accessors.getMinutes(date);
  const ss = accessors.getSeconds(date);
  const ms = accessors.getMilliseconds(date);
  // Get a year string:
  const year = "" + y;
  // Get a 0 padded month string
  const month = zeropad(m + 1); //months are 0-offset, sigh
  // Get a 0 padded day string
  const day = zeropad(d);
  const frac = hh * 3600 + mm * 60 + ss + 1e-3 * ms;
  let ret = year + "/" + month + "/" + day;
  if (frac) {
    ret += " " + hmsString_(hh, mm, ss, ms);
  }
  return ret;
};

/**
 * Round a number to the specified number of digits past the decimal point.
 * @param num The number to round
 * @param places The number of decimals to which to round
 * @return The rounded number
 * @private
 */
export const round_ = (num: number, places: number): number => {
  const shift = Math.pow(10, places);
  return Math.round(num * shift) / shift;
};

/**
 * Implementation of binary search over an array.
 * Currently does not work when val is outside the range of arry's values.
 * @param val the value to search for
 * @param arry is the value over which to search
 * @param abs If abs > 0, find the lowest entry greater than val
 *     If abs < 0, find the highest entry less than val.
 *     If abs == 0, find the entry that equals val.
 * @param low The first index in arry to consider (optional)
 * @param high The last index in arry to consider (optional)
 * @return Index of the element, or -1 if it isn't found.
 * @private
 */
/**
 * First index of `series` whose x value is >= `x`, or `series.length` when
 * every x is smaller.
 *
 * `binarySearch` below works on a flat number array and returns -1 on a miss,
 * which is the wrong shape for slicing a series to a date window: what is
 * needed there is the insertion point, not an exact hit.
 *
 * @private
 */
export const lowerBoundX = (
  series: ArrayLike<readonly [number, ...unknown[]]>,
  x: number,
): number => {
  let low = 0;
  let high = series.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (series[mid]![0] < x) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
};

/**
 * Last index of `series` whose x value is <= `x`, or -1 when every x is
 * larger.
 *
 * @private
 */
export const upperBoundX = (
  series: ArrayLike<readonly [number, ...unknown[]]>,
  x: number,
): number => {
  let low = 0;
  let high = series.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (series[mid]![0] <= x) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low - 1;
};

export const binarySearch = (
  val: number,
  arry: number[],
  abs?: number,
  low?: number,
  high?: number,
): number => {
  if (
    low === null ||
    low === undefined ||
    high === null ||
    high === undefined
  ) {
    low = 0;
    high = arry.length - 1;
  }
  if (low > high) {
    return -1;
  }
  if (abs === null || abs === undefined) {
    abs = 0;
  }
  const validIndex = (idx: number) => {
    return idx >= 0 && idx < arry.length;
  };
  const mid = parseInt(String((low + high) / 2), 10);
  const element = arry[mid]!;
  let idx;
  if (element === val) {
    return mid;
  } else if (element > val) {
    if (abs > 0) {
      // Accept if element > val, but also if prior element < val.
      idx = mid - 1;
      if (validIndex(idx) && arry[idx]! < val) {
        return mid;
      }
    }
    return binarySearch(val, arry, abs, low, mid - 1);
  } else if (element < val) {
    if (abs < 0) {
      // Accept if element < val, but also if prior element > val.
      idx = mid + 1;
      if (validIndex(idx) && arry[idx]! > val) {
        return mid;
      }
    }
    return binarySearch(val, arry, abs, mid + 1, high);
  }
  return -1; // can't actually happen, but makes closure compiler happy
};

/**
 * Parses an ISO-8601 date (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss` with an
 * optional fraction and `Z`/offset). Other formats need `xValueParser`.
 */
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const dateParser = (dateStr: string): number => {
  const text = dateStr.trim();
  if (!ISO_DATE.test(text)) {
    log.error(
      "Couldn't parse " +
        dateStr +
        " as an ISO date. Pass xValueParser for other formats.",
    );
    return NaN;
  }
  const ms = new Date(text).getTime();
  if (Number.isNaN(ms)) {
    log.error("Couldn't parse " + dateStr + " as an ISO date.");
    return NaN;
  }
  return ms;
};

/**
 * Keys that walk out of the object being merged and into the prototype chain.
 * Both merge helpers below run over caller-supplied option objects, which are
 * routinely `JSON.parse`d from an API response, so these arrive as own
 * properties and would otherwise be written straight to `Object.prototype`.
 */
const UNSAFE_MERGE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** @private */
const mergeableKeys = (o: object): string[] => {
  return Object.keys(o).filter((k) => !UNSAFE_MERGE_KEYS.has(k));
};

// These functions are all based on MochiKit.
/**
 * Copies all the properties from o to self.
 *
 *
 * */
export const update = <T extends object>(
  self: T,
  o: object | null | undefined,
): T => {
  if (o != null && typeof o === "object") {
    for (const k of mergeableKeys(o)) {
      Reflect.set(self, k, Reflect.get(o, k));
    }
  }
  return self;
};

// internal: check if o is a DOM node, and we know it’s not null
const _isNode =
  typeof Node !== "undefined" && Node !== null && typeof Node === "object"
    ? (o: unknown) => {
        return o instanceof Node;
      }
    : (o: unknown) => {
        if (typeof o !== "object" || o === null) {
          return false;
        }
        return (
          typeof Reflect.get(o, "nodeType") === "number" &&
          typeof Reflect.get(o, "nodeName") === "string"
        );
      };

/**
 * Deep-merge properties from o into self (mutates self).
 * Not structuredClone: this is a merge (untouched keys stay), defaults include
 * functions, and DOM Nodes (e.g. labelsDiv) must keep the live reference.
 * Arrays are shallow-copied via .slice().
 *
 *
 * @return * @private
 */
export const updateDeep = <T extends object>(
  self: T,
  o: object | null | undefined,
): T => {
  if (typeof o != "undefined" && o !== null) {
    for (const k of mergeableKeys(o)) {
      const v: unknown = Reflect.get(o, k);
      if (v === null) {
        Reflect.set(self, k, null);
      } else if (isArrayLike(v)) {
        Reflect.set(self, k, Array.prototype.slice.call(v));
      } else if (_isNode(v)) {
        // DOM objects are shallowly-copied.
        Reflect.set(self, k, v);
      } else if (typeof v == "object") {
        const nested: unknown = Reflect.get(self, k);
        if (typeof nested != "object" || nested === null) {
          Reflect.set(self, k, {});
        }
        const next = Reflect.get(self, k);
        if (typeof next === "object" && next !== null) {
          updateDeep(next, v);
        }
      } else {
        Reflect.set(self, k, v);
      }
    }
  }
  return self;
};

/**
 * @private
 */
export const typeArrayLike = (o: unknown): string => {
  if (o === null) {
    return "null";
  }
  return isArrayLike(o) ? "array" : typeof o;
};

/**
 * @private
 */
export const isArrayLike = (o: unknown): o is ArrayLike<unknown> => {
  if (o === null) {
    return false;
  }
  const t = typeof o;
  if (t !== "object" && t !== "function") {
    return false;
  }
  const bag: object = Object(o);
  const length = Reflect.get(bag, "length");
  const nodeType = Reflect.get(bag, "nodeType");
  const item = Reflect.get(bag, "item");
  return (
    typeof length === "number" &&
    nodeType !== 3 &&
    nodeType !== 4 &&
    (t === "object" || typeof item === "function")
  );
};

/**
 * @private
 */
export const isDateLike = (o: unknown): o is { getTime: () => number } => {
  return (
    o !== null &&
    typeof o === "object" &&
    "getTime" in o &&
    typeof o.getTime === "function"
  );
};

/**
 * Deep-clone nested arrays (chart data). Uses structuredClone when available.
 * @private
 */
export function clone<T>(o: T[]): T[];
export function clone(o: unknown[]): unknown[] {
  if (typeof structuredClone === "function") {
    return structuredClone(o);
  }
  const r: unknown[] = [];
  for (let i = 0; i < o.length; i++) {
    const item = o[i];
    if (Array.isArray(item)) {
      r.push(clone(item));
    } else {
      r.push(item);
    }
  }
  return r;
}

/**
 * Create a new canvas element.
 *
 * @return * @private
 */
export const createCanvas = (): HTMLCanvasElement => {
  return document.createElement("canvas");
};

/**
 * Returns the context's pixel ratio, which is the ratio between the device
 * pixel ratio and the backing store ratio. Typically this is 1 for conventional
 * displays, and > 1 for HiDPI displays (such as the Retina MBP). For more, see:
 * https://web.archive.org/web/20200806170103/https://html5rocks.com/en/tutorials/canvas/hidpi/
 *
 * @param context The canvas's 2d context.
 * @return The ratio of the device pixel ratio and the backing store
 * ratio for the specified context.
 */
/**
 * Device pixel ratio for HiDPI canvases.
 * @param context The canvas's 2d context (unused; kept for call-site compat).
 * */
export const getContextPixelRatio = (
  _context?: CanvasRenderingContext2D | null,
): number => {
  return window.devicePixelRatio || 1;
};

/**
 *
 *
 * @constructor
 */
export class Iterator<T = unknown> {
  hasNext = true; // Use to identify if there's another element.
  peek: T | null = null; // Use for look-ahead
  start_: number;
  array_: T[];
  predicate_: ((array: T[], idx: number) => boolean) | null | undefined;
  end_: number;
  nextIdx_: number;

  constructor(
    array: T[],
    start: number,
    length: number,
    predicate?: ((array: T[], idx: number) => boolean) | null,
  ) {
    start = start || 0;
    length = length || array.length;
    this.start_ = start;
    this.array_ = array;
    this.predicate_ = predicate;
    this.end_ = Math.min(array.length, start + length);
    this.nextIdx_ = start - 1; // use -1 so initial advance works.
    this.next(); // ignoring result.
  }

  next() {
    if (!this.hasNext) {
      return null;
    }
    const obj = this.peek;

    let nextIdx = this.nextIdx_ + 1;
    let found = false;
    while (nextIdx < this.end_) {
      if (!this.predicate_ || this.predicate_(this.array_, nextIdx)) {
        this.peek = this.array_[nextIdx] ?? null;
        found = true;
        break;
      }
      nextIdx++;
    }
    this.nextIdx_ = nextIdx;
    if (!found) {
      this.hasNext = false;
      this.peek = null;
    }
    return obj;
  }
}

/**
 * Returns a new iterator over array, between indexes start and
 * start + length, and only returns entries that pass the accept function
 *
 * @param array the array to iterate over.
 * @param start the first index to iterate over, 0 if absent.
 * @param length the number of elements in the array to iterate over.
 *     This, along with start, defines a slice of the array, and so length
 *     doesn't imply the number of elements in the iterator when accept doesn't
 *     always accept all values. array.length when absent.
 * @param opt_predicate a function that takes
 *     parameters array and idx, which returns true when the element should be
 *     returned.  If omitted, all elements are accepted.
 * @private
 */
export const createIterator = <T>(
  array: T[],
  start: number,
  length: number,
  opt_predicate?: ((array: T[], idx: number) => boolean) | null,
): Iterator<T> => {
  return new Iterator(array, start, length, opt_predicate);
};

/** Native requestAnimationFrame (modern browsers). */
export const requestAnimFrame = (callback: FrameRequestCallback): number =>
  window.requestAnimationFrame(callback);

export interface Coalesced<T extends unknown[] = unknown[]> {
  (...args: T): void;
  /** Run a pending call right now, if there is one. */
  flush(): void;
  /** Drop a pending call without running it. */
  cancel(): void;
}

/**
 * Wrap a handler so that repeated calls within one animation frame collapse
 * into a single call with the most recent arguments.
 *
 * A drag or a resize fires far more events than the screen can show: the
 * browser can deliver several mousemoves per frame, and each one used to
 * trigger a full redraw whose result was immediately overwritten. Only the
 * last one in a frame is visible, so only the last one is worth drawing.
 *
 * @private
 */
export const coalesceFrames = <T extends unknown[]>(
  fn: (...args: T) => void,
): Coalesced<T> => {
  let handle = 0;
  let pending: T | null = null;

  const run = () => {
    handle = 0;
    const args = pending;
    pending = null;
    if (args) {
      fn(...args);
    }
  };

  const wrapped = (...args: T): void => {
    pending = args;
    if (!handle) {
      handle = requestAnimFrame(run);
    }
  };

  return Object.assign(wrapped, {
    flush() {
      if (!handle) {
        return;
      }
      window.cancelAnimationFrame(handle);
      run();
    },
    cancel() {
      if (handle) {
        window.cancelAnimationFrame(handle);
      }
      handle = 0;
      pending = null;
    },
  });
};

/**
 * Call a function at most maxFrames times at an attempted interval of
 * framePeriodInMillis, then call a cleanup function once. repeatFn is called
 * once immediately, then at most (maxFrames - 1) times asynchronously. If
 * maxFrames==1, then cleanup_fn() is also called synchronously.  This function
 * is used to sequence animation.
 * @param repeatFn Called repeatedly -- takes the frame
 *     number (from 0 to maxFrames-1) as an argument.
 * @param maxFrames The max number of times to call repeatFn
 * @param framePeriodInMillis Max requested time between frames.
 * @param cleanupFn A function to call after all repeatFn calls.
 * @private
 */
export const repeatAndCleanup = (
  repeatFn: (frame: number) => void,
  maxFrames: number,
  framePeriodInMillis: number,
  cleanupFn: () => void,
): (() => void) => {
  let frameNumber = 0;
  let previousFrameNumber;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const startTime = new Date().getTime();
  repeatFn(frameNumber);
  if (maxFrames === 1) {
    cleanupFn();
    return stop;
  }
  const maxFrameArg = maxFrames - 1;

  const loop = () => {
    if (stopped || frameNumber >= maxFrames) {
      return;
    }
    requestAnimFrame(() => {
      if (stopped) {
        return;
      }
      // Determine which frame to draw based on the delay so far.  Will skip
      // frames if necessary.
      const currentTime = new Date().getTime();
      const delayInMillis = currentTime - startTime;
      previousFrameNumber = frameNumber;
      frameNumber = Math.floor(delayInMillis / framePeriodInMillis);
      const frameDelta = frameNumber - previousFrameNumber;
      // If we predict that the subsequent repeatFn call will overshoot our
      // total frame target, so our last call will cause a stutter, then jump to
      // the last call immediately.  If we're going to cause a stutter, better
      // to do it faster than slower.
      const predictOvershootStutter = frameNumber + frameDelta > maxFrameArg;
      if (predictOvershootStutter || frameNumber >= maxFrameArg) {
        repeatFn(maxFrameArg); // Ensure final call with maxFrameArg.
        cleanupFn();
      } else {
        if (frameDelta !== 0) {
          // Don't call repeatFn with duplicate frames.
          repeatFn(frameNumber);
        }
        loop();
      }
    });
  };
  loop();
  return stop;
};

// A whitelist of options that do not change pixel positions.
const pixelSafeOptions: Record<string, boolean> = {
  annotationClickHandler: true,
  annotationDblClickHandler: true,
  annotationMouseOutHandler: true,
  annotationMouseOverHandler: true,
  axisLineColor: true,
  axisLineWidth: true,
  clickCallback: true,
  drawCallback: true,
  drawHighlightPointCallback: true,
  drawPoints: true,
  drawPointCallback: true,
  drawGrid: true,
  fillAlpha: true,
  gridLineColor: true,
  gridLineWidth: true,
  hideOverlayOnMouseOut: true,
  highlightCallback: true,
  highlightCircleSize: true,
  interactionModel: true,
  labelsDiv: true,
  labelsKMG2: true,
  labelsSeparateLines: true,
  labelsShowZeroValues: true,
  panEdgeFraction: true,
  pixelsPerYLabel: true,
  pointClickCallback: true,
  pointSize: true,
  rangeSelectorPlotFillColor: true,
  rangeSelectorPlotFillGradientColor: true,
  rangeSelectorPlotStrokeColor: true,
  rangeSelectorBackgroundStrokeColor: true,
  rangeSelectorBackgroundLineWidth: true,
  rangeSelectorPlotLineWidth: true,
  rangeSelectorForegroundStrokeColor: true,
  rangeSelectorForegroundLineWidth: true,
  rangeSelectorAlpha: true,
  showLabelsOnHighlight: true,
  strokeWidth: true,
  underlayCallback: true,
  unhighlightCallback: true,
  zoomCallback: true,
};

/**
 * This function will scan the option list and determine if they
 * require us to recalculate the pixel positions of each point.
 * @param labels a list of options to check.
 * @param attrs * @return true if the graph needs new points else false.
 * @private
 */
export const isPixelChangingOptionList = (
  labels: string[],
  attrs: object,
): boolean => {
  // Assume that we do not require new points.
  // This will change to true if we actually do need new points.

  // Create a dictionary of series names for faster lookup.
  // If there are no labels, then the dictionary stays empty.
  const seriesNamesDictionary: Record<string, true> = {};
  if (labels) {
    for (let i = 1; i < labels.length; i++) {
      seriesNamesDictionary[labels[i]!] = true;
    }
  }

  // Scan through a flat (i.e. non-nested) object of options.
  // Returns true/false depending on whether new points are needed.
  const scanFlatOptions = (options: object) => {
    for (const property of Object.keys(options)) {
      if (!pixelSafeOptions[property]) {
        return true;
      }
    }
    return false;
  };

  // Iterate through the list of updated options.
  for (const property of Object.keys(attrs)) {
    const value: unknown = Reflect.get(attrs, property);

    // Find out of this field is actually a series specific options list.
    if (
      property === "highlightSeriesOpts" ||
      (seriesNamesDictionary[property] && !Object.hasOwn(attrs, "series"))
    ) {
      // This property value is a list of options for this series.
      if (
        typeof value === "object" &&
        value !== null &&
        scanFlatOptions(value)
      ) {
        return true;
      }
    } else if (property === "series" || property === "axes") {
      // This is twice-nested options list.
      if (typeof value !== "object" || value === null) {
        continue;
      }
      for (const series of Object.keys(value)) {
        const seriesOpts: unknown = Reflect.get(value, series);
        if (
          typeof seriesOpts === "object" &&
          seriesOpts !== null &&
          scanFlatOptions(seriesOpts)
        ) {
          return true;
        }
      }
    } else if (!pixelSafeOptions[property]) {
      // If this was not a series specific option list,
      // check if it's a pixel-changing property.
      return true;
    }
  }

  return false;
};

export const Circles: {
  DEFAULT: DrawPointCallback;
  [key: string]: DrawPointCallback;
} = {
  DEFAULT(_g, _name, ctx, canvasx, canvasy, color, radius) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(canvasx, canvasy, radius, 0, 2 * Math.PI, false);
    ctx.fill();
  },
  // For more shapes, include extras/shapes.js
};

/**
 * Determine whether |data| is delimited by CR, CRLF, LF, LFCR.
 * @param data * @return the delimiter that was detected (or null on failure).
 */
export const detectLineDelimiter = (data: string): string | null => {
  for (let i = 0; i < data.length; i++) {
    const code = data.charAt(i);
    if (code === "\r") {
      // Might actually be "\r\n".
      if (i + 1 < data.length && data.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return code;
    }
    if (code === "\n") {
      // Might actually be "\n\r".
      if (i + 1 < data.length && data.charAt(i + 1) === "\r") {
        return "\n\r";
      }
      return code;
    }
  }

  return null;
};

/**
 * Is one node contained by another?
 * @param containee The contained node.
 * @param container The container node.
 * @return Whether containee is inside (or equal to) container.
 * @private
 */
export const isNodeContainedBy = (
  containee: Node | null,
  container: Node | null,
): boolean => {
  if (container === null || containee === null) {
    return false;
  }
  let containeeNode: Node | null = containee;
  while (containeeNode && containeeNode !== container) {
    containeeNode = containeeNode.parentNode;
  }
  return containeeNode === container;
};

const RGBAxRE =
  /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})?$/;
const RGBA_RE =
  /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*([01](?:\.\d+)?))?\)$/;

/**
 * Helper for toRGB_ which parses strings of the form:
 * #RRGGBB (hex)
 * #RRGGBBAA (hex)
 * rgb(123, 45, 67)
 * rgba(123, 45, 67, 0.5)
 * @return parsed {r,g,b,a?} tuple or null.
 */
const parseRGBA = (rgbStr: string) => {
  let bits,
    r,
    g,
    b,
    a = null;
  if ((bits = RGBAxRE.exec(rgbStr))) {
    r = parseInt(bits[1]!, 16);
    g = parseInt(bits[2]!, 16);
    b = parseInt(bits[3]!, 16);
    if (bits[4]!) {
      a = parseInt(bits[4], 16);
    }
  } else if ((bits = RGBA_RE.exec(rgbStr))) {
    r = parseInt(bits[1]!, 10);
    g = parseInt(bits[2]!, 10);
    b = parseInt(bits[3]!, 10);
    if (bits[4]!) {
      a = parseFloat(bits[4]);
    }
  } else {
    return null;
  }
  if (a !== null) {
    return { r: r, g: g, b: b, a: a };
  }
  return { r: r, g: g, b: b };
};

/**
 * Converts any valid CSS color (hex, rgb(), named color) to an RGB tuple.
 *
 * @param colorStr Any valid CSS color string.
 * @return } Parsed RGB tuple.
 * @private
 */
const rgbCache = new Map<string, ReturnType<typeof parseRGBA>>();

export const toRGB_ = (colorStr: string) => {
  const cached = rgbCache.get(colorStr);
  if (cached) {
    return cached;
  }
  // Strategy: First try to parse colorStr directly. This is fast & avoids DOM
  // manipulation.  If that fails (e.g. for named colors like 'red'), then
  // create a hidden DOM element and parse its computed color.
  const rgb = parseRGBA(colorStr);
  if (rgb) {
    rgbCache.set(colorStr, rgb);
    return rgb;
  }

  const div = document.createElement("div");
  div.style.backgroundColor = colorStr;
  div.style.visibility = "hidden";
  document.body.appendChild(div);
  const rgbStr = window.getComputedStyle(div, null).backgroundColor;
  div.remove();
  const parsed = parseRGBA(rgbStr);
  if (parsed) {
    rgbCache.set(colorStr, parsed);
  }
  return parsed;
};

/**
 * Parses the value as a floating point number. This is like the parseFloat()
 * built-in, but with a few differences:
 * - the empty string is parsed as null, rather than NaN.
 * - if the string cannot be parsed at all, an error is logged.
 * If the string can't be parsed, this method returns null.
 * @param x The string to be parsed
 * @param opt_line_no The line number from which the string comes.
 * @param opt_line The text of the line from which the string comes.
 */
export const parseFloat_ = (
  x: string,
  opt_line_no?: number,
  opt_line?: string,
) => {
  const val = parseFloat(x);
  if (!isNaN(val)) {
    return val;
  }

  // Try to figure out what happeend.
  // If the value is the empty string, parse it as null.
  if (/^ *$/.test(x)) {
    return null;
  }

  // If it was actually "NaN", return it as NaN.
  if (/^ *nan *$/i.test(x)) {
    return NaN;
  }

  // Looks like a parsing error.
  let msg = "Unable to parse '" + x + "' as a number";
  if (opt_line !== undefined && opt_line_no !== undefined) {
    msg +=
      " on line " + (1 + (opt_line_no || 0)) + " ('" + opt_line + "') of CSV.";
  }
  log.error(msg);

  return null;
};

// Label constants for labelsKMG2 (i.e. 1048576 -> "1Mi").
const KMG2_LABELS_LARGE = ["Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi", "Yi"];
const KMG2_LABELS_SMALL = [
  "p-10",
  "p-20",
  "p-30",
  "p-40",
  "p-50",
  "p-60",
  "p-70",
  "p-80",
];

/** Read OptionsGetter fields without narrow casts. */
const optNumber = (opts: OptionsGetter, name: string, fallback: number): number => {
  const v = opts(name);
  return typeof v === "number" ? v : fallback;
};

const optNumberOrNull = (opts: OptionsGetter, name: string): number | null => {
  const v = opts(name);
  if (v === null) {
    return null;
  }
  return typeof v === "number" ? v : null;
};

const optBoolean = (opts: OptionsGetter, name: string): boolean => {
  const v = opts(name);
  return typeof v === "boolean" ? v : Boolean(v);
};

/**
 * @private
 * Return a string version of a number. This respects the digitsAfterDecimal
 * and maxNumberWidth options.
 * @param x The number to be formatted
 * @param opts An options view
 */
export const numberValueFormatter = (x: number, opts: OptionsGetter) => {
  const sigFigs = optNumberOrNull(opts, "sigFigs");

  if (sigFigs !== null) {
    // User has opted for a fixed number of significant figures.
    return floatFormat(x, sigFigs);
  }

  // shortcut 0 so later code does not need to worry about it
  if (x === 0.0) {
    return "0";
  }

  const digits = optNumber(opts, "digitsAfterDecimal", 2);
  const maxNumberWidth = optNumber(opts, "maxNumberWidth", 8);

  const kmg2 = optBoolean(opts, "labelsKMG2");

  let label;
  const absx = Math.abs(x);

  if (kmg2) {
    const k = 1024;
    const k_labels = KMG2_LABELS_LARGE;
    const m_labels = KMG2_LABELS_SMALL;

    let n = 1;
    let j;
    if (absx >= k) {
      j = k_labels.length;
      while (j > 0) {
        n = Math.pow(k, j);
        --j;
        if (absx >= n) {
          // guaranteed to hit because absx >= k (Math.pow(k, 1))
          // if immensely large still switch to scientific notation
          if (absx / n >= Math.pow(10, maxNumberWidth)) {
            label = x.toExponential(digits);
          } else {
            label = round_(x / n, digits) + k_labels[j]!;
          }
          return label;
        }
      }
      // not reached, fall through safely though should it ever be
    } else if (absx < 1 /* && (m_labels.length > 0) */) {
      j = 0;
      while (j < m_labels.length) {
        ++j;
        n = Math.pow(k, j);
        if (absx * n >= 1) {
          break;
        }
      }
      // if _still_ too small, switch to scientific notation instead
      if (absx * n < Math.pow(10, -digits)) {
        label = x.toExponential(digits);
      } else {
        label = round_(x * n, digits) + m_labels[j - 1]!;
      }
      return label;
    }
    // else fall through
  }

  if (absx >= Math.pow(10, maxNumberWidth) || absx < Math.pow(10, -digits)) {
    // switch to scientific notation if we underflow or overflow fixed display
    label = x.toExponential(digits);
  } else {
    label = "" + round_(x, digits);
  }

  return label;
};

/**
 * variant for use as an axisLabelFormatter.
 * @private
 */
export const numberAxisLabelFormatter = (
  x: number,
  _granularity: number,
  opts: OptionsGetter,
) => {
  return numberValueFormatter(x, opts);
};

/**

 * @private
 * @constant
 */
const SHORT_MONTH_NAMES_ = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Convert a JS date to a string appropriate to display on an axis that
 * is displaying values at the stated granularity. This respects the
 * labelsUTC option.
 * @param date The date to format
 * @param granularity One of the Zpgraph granularity constants
 * @param opts An options view
 * @return The date formatted as local time
 * @private
 */
export const dateAxisLabelFormatter = (
  date: Date,
  granularity: number,
  opts: OptionsGetter,
): string => {
  const utc = optBoolean(opts, "labelsUTC");
  const accessors = utc ? DateAccessorsUTC : DateAccessorsLocal;

  const year = accessors.getFullYear(date),
    month = accessors.getMonth(date),
    day = accessors.getDate(date),
    hours = accessors.getHours(date),
    mins = accessors.getMinutes(date),
    secs = accessors.getSeconds(date),
    millis = accessors.getMilliseconds(date);

  if (granularity >= Granularity.DECADAL) {
    return "" + year;
  }
  if (granularity >= Granularity.MONTHLY) {
    return SHORT_MONTH_NAMES_[month] + "\u00a0" + year;
  }
  const frac = hours * 3600 + mins * 60 + secs + 1e-3 * millis;
  if (frac === 0 || granularity >= Granularity.DAILY) {
    // e.g. '21 Jan' (%d%b)
    return zeropad(day) + "\u00a0" + SHORT_MONTH_NAMES_[month];
  }
  if (granularity < Granularity.SECONDLY) {
    // e.g. 40.310 (meaning 40 seconds and 310 milliseconds)
    const str = "" + millis;
    return zeropad(secs) + "." + ("000" + str).slice(str.length);
  }
  if (granularity > Granularity.MINUTELY) {
    return hmsString_(hours, mins, secs, 0);
  }
  return hmsString_(hours, mins, secs, millis);
};

/**
 * Return a string version of a JS date for a value label. This respects the
 * labelsUTC option.
 * @param date The date to be formatted
 * @param opts An options view
 * @private
 */
export const dateValueFormatter = (d: number, opts: OptionsGetter) => {
  return dateString_(d, optBoolean(opts, "labelsUTC"));
};

"use strict";

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/*
 * A ticker is a function with the following interface:
 *
 * function(a, b, pixels, options_view, zpgraph, forced_values);
 * -> [ { v: tick1_v, label: tick1_label[, label_v: label_v1] },
 *      { v: tick2_v, label: tick2_label[, label_v: label_v2] },
 *      ...
 *    ]
 *
 * The returned value is called a "tick list".
 *
 * Arguments
 * ---------
 *
 * [a, b] is the range of the axis for which ticks are being generated. For a
 * numeric axis, these will simply be numbers. For a date axis, these will be
 * millis since epoch (convertable to Date objects using "new Date(a)" and "new
 * Date(b)").
 *
 * opts provides access to chart- and axis-specific options. It can be used to
 * access number/date formatting code/options, check for a log scale, etc.
 *
 * pixels is the length of the axis in pixels. opts('pixelsPerLabel') is the
 * minimum amount of space to be allotted to each label. For instance, if
 * pixels=400 and opts('pixelsPerLabel')=40 then the ticker should return
 * between zero and ten (400/40) ticks.
 *
 * zpgraph is the Zpgraph object for which an axis is being constructed.
 *
 * forced_values is used for secondary y-axes. The tick positions are typically
 * set by the primary y-axis, so the secondary y-axis has no choice in where to
 * put these. It simply has to generate labels for these data values.
 *
 * Tick lists
 * ----------
 * Typically a tick will have both a grid/tick line and a label at one end of
 * that line (at the bottom for an x-axis, at left or right for the y-axis).
 *
 * A tick may be missing one of these two components:
 * - If "label_v" is specified instead of "v", then there will be no tick or
 *   gridline, just a label.
 * - Similarly, if "label" is not specified, then there will be a gridline
 *   without a label.
 *
 * This flexibility is useful in a few situations:
 * - For log scales, some of the tick lines may be too close to all have labels.
 * - For date scales where years are being displayed, it is desirable to display
 *   tick marks at the beginnings of years but labels (e.g. "2006") in the
 *   middle of the years.
 */

/*jshint sub:true */
/*global Zpgraph:false */

import { Granularity } from "./granularity";
import * as utils from "./utils";
import type { AxisLabelFormatter, Ticker } from "./types";

export { Granularity };

type AxisOpts = (name: string) => unknown;
type TickResult = ReturnType<Ticker>;

interface NumericTick {
  v: number;
  label?: string;
  label_v?: number;
}

interface TickPlacement {
  datefield: number;
  step: number;
  spacing: number;
}

type DateParts = [number, number, number, number, number, number, number];

export const numericLinearTicks: Ticker = (a, b, pixels, opts, zpgraph, vals) =>
  numericTicks(
    a,
    b,
    pixels,
    (opt: string) => (opt === "logscale" ? false : opts(opt)),
    zpgraph,
    vals,
  );

export const numericTicks: Ticker = (a, b, pixels, opts, zpgraph, vals) => {
  const pixels_per_tick = opts("pixelsPerLabel") as number;
  const ticks: NumericTick[] = [];
  let i, j, tickV, nTicks;
  if (vals?.length) {
    ticks.push(...vals.map((v) => ({ v })));
  } else {
    if (opts("logscale")) {
      nTicks = Math.floor(pixels / pixels_per_tick);
      let minIdx = utils.binarySearch(a, PREFERRED_LOG_TICK_VALUES, 1);
      let maxIdx = utils.binarySearch(b, PREFERRED_LOG_TICK_VALUES, -1);
      if (minIdx === -1) {
        minIdx = 0;
      }
      if (maxIdx === -1) {
        maxIdx = PREFERRED_LOG_TICK_VALUES.length - 1;
      }
      // Count the number of tick values would appear, if we can get at least
      // nTicks / 4 accept them.
      let lastDisplayed = null;
      if (maxIdx - minIdx >= nTicks / 4) {
        for (let idx = maxIdx; idx >= minIdx; idx--) {
          const tickValue = PREFERRED_LOG_TICK_VALUES[idx]!;
          const pixel_coord =
            (Math.log(tickValue / a) / Math.log(b / a)) * pixels;
          const tick: NumericTick = { v: tickValue };
          if (lastDisplayed === null) {
            lastDisplayed = {
              tickValue: tickValue,
              pixel_coord: pixel_coord,
            };
          } else if (
            Math.abs(pixel_coord - lastDisplayed.pixel_coord) >=
            pixels_per_tick
          ) {
            lastDisplayed = {
              tickValue: tickValue,
              pixel_coord: pixel_coord,
            };
          } else {
            tick.label = "";
          }
          ticks.push(tick);
        }
        // Since we went in backwards order.
        ticks.reverse();
      }
    }

    // ticks.length won't be 0 if the log scale function finds values to insert.
    if (ticks.length === 0) {
      // Basic idea:
      // Try labels every 1, 2, 5, 10, 20, 50, 100, etc.
      // Calculate the resulting tick spacing (i.e. this.height_ / nTicks).
      // The first spacing greater than pixelsPerYLabel is what we use.
      const kmg2 = opts("labelsKMG2");
      let mults, base;
      if (kmg2) {
        mults = [1, 2, 4, 8, 16, 32, 64, 128, 256];
        base = 16;
      } else {
        mults = [1, 2, 5, 10, 20, 50, 100];
        base = 10;
      }

      // Get the maximum number of permitted ticks based on the
      // graph's pixel size and pixels_per_tick setting.
      const max_ticks = Math.ceil(pixels / pixels_per_tick);

      // Now calculate the data unit equivalent of this tick spacing.
      // Use abs() since graphs may have a reversed Y axis.
      const units_per_tick = Math.abs(b - a) / max_ticks;

      // Based on this, get a starting scale which is the largest
      // integer power of the chosen base (10 or 16) that still remains
      // below the requested pixels_per_tick spacing.
      const base_power = Math.floor(Math.log(units_per_tick) / Math.log(base));
      const base_scale = Math.pow(base, base_power);

      // Now try multiples of the starting scale until we find one
      // that results in tick marks spaced sufficiently far apart.
      // The "mults" array should cover the range 1 .. base^2 to
      // adjust for rounding and edge effects.
      let scale = 0,
        low_val = 0,
        high_val = 0,
        spacing;
      nTicks = 0;
      for (j = 0; j < mults.length; j++) {
        scale = base_scale * mults[j]!;
        low_val = Math.floor(a / scale) * scale;
        high_val = Math.ceil(b / scale) * scale;
        nTicks = Math.abs(high_val - low_val) / scale;
        spacing = pixels / nTicks;
        if (spacing > pixels_per_tick) {
          break;
        }
      }

      // Construct the set of ticks.
      // Allow reverse y-axis if it's explicitly requested.
      if (low_val > high_val) {
        scale *= -1;
      }
      for (i = 0; i <= nTicks; i++) {
        tickV = low_val + i * scale;
        ticks.push({ v: tickV });
      }
    }
  }

  const formatter = opts("axisLabelFormatter") as AxisLabelFormatter;

  // Add labels to the ticks.
  for (const tick of ticks) {
    if (tick.label !== undefined) {
      continue;
    } // Use current label.
    tick.label = formatter.call(zpgraph, tick.v, 0, opts, zpgraph);
  }

  return ticks as TickResult;
};

export const integerTicks: Ticker = (a, b, pixels, opts, zpgraph, vals) =>
  numericTicks(a, b, pixels, opts, zpgraph, vals).filter(
    (tick) => tick.v % 1 === 0,
  );

export const dateTicker: Ticker = (a, b, pixels, opts, zpgraph, _vals) => {
  const chosen = pickDateTickGranularity(a, b, pixels, opts);
  // chosen < 0 can happen if self.width_ is zero.
  return chosen >= 0 ? getDateAxis(a, b, chosen, opts, zpgraph) : [];
};

// Date components enumeration (in the order of the arguments in Date)
const DateField = {
  DATEFIELD_Y: 0,
  DATEFIELD_M: 1,
  DATEFIELD_D: 2,
  DATEFIELD_HH: 3,
  DATEFIELD_MM: 4,
  DATEFIELD_SS: 5,
  DATEFIELD_MS: 6,
  NUM_DATEFIELDS: 7,
};

/**
 * The value of datefield will start at an even multiple of "step", i.e.
 *   if datefield=SS and step=5 then the first tick will be on a multiple of 5s.
 *
 * For granularities <= HOURLY, ticks are generated every `spacing` ms.
 *
 * At coarser granularities, ticks are generated by incrementing `datefield` by
 *   `step`. In this case, the `spacing` value is only used to estimate the
 *   number of ticks. It should roughly correspond to the spacing between
 *   adjacent ticks.
 *
 * >}
 */
// Index order matches Granularity.* (shared with utils via ./granularity).
const TICK_PLACEMENT: TickPlacement[] = [
  { datefield: DateField.DATEFIELD_MS, step: 1, spacing: 1 }, // MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 2, spacing: 2 }, // TWO_MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 5, spacing: 5 }, // FIVE_MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 10, spacing: 10 }, // TEN_MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 50, spacing: 50 }, // FIFTY_MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 100, spacing: 100 }, // HUNDRED_MILLISECONDLY
  { datefield: DateField.DATEFIELD_MS, step: 500, spacing: 500 }, // FIVE_HUNDRED_MILLISECONDLY
  { datefield: DateField.DATEFIELD_SS, step: 1, spacing: 1000 * 1 }, // SECONDLY
  { datefield: DateField.DATEFIELD_SS, step: 2, spacing: 1000 * 2 }, // TWO_SECONDLY
  { datefield: DateField.DATEFIELD_SS, step: 5, spacing: 1000 * 5 }, // FIVE_SECONDLY
  { datefield: DateField.DATEFIELD_SS, step: 10, spacing: 1000 * 10 }, // TEN_SECONDLY
  { datefield: DateField.DATEFIELD_SS, step: 30, spacing: 1000 * 30 }, // THIRTY_SECONDLY
  { datefield: DateField.DATEFIELD_MM, step: 1, spacing: 1000 * 60 }, // MINUTELY
  { datefield: DateField.DATEFIELD_MM, step: 2, spacing: 1000 * 60 * 2 }, // TWO_MINUTELY
  { datefield: DateField.DATEFIELD_MM, step: 5, spacing: 1000 * 60 * 5 }, // FIVE_MINUTELY
  { datefield: DateField.DATEFIELD_MM, step: 10, spacing: 1000 * 60 * 10 }, // TEN_MINUTELY
  { datefield: DateField.DATEFIELD_MM, step: 30, spacing: 1000 * 60 * 30 }, // THIRTY_MINUTELY
  { datefield: DateField.DATEFIELD_HH, step: 1, spacing: 1000 * 3600 }, // HOURLY
  { datefield: DateField.DATEFIELD_HH, step: 2, spacing: 1000 * 3600 * 2 }, // TWO_HOURLY
  { datefield: DateField.DATEFIELD_HH, step: 6, spacing: 1000 * 3600 * 6 }, // SIX_HOURLY
  { datefield: DateField.DATEFIELD_D, step: 1, spacing: 1000 * 86400 }, // DAILY
  { datefield: DateField.DATEFIELD_D, step: 2, spacing: 1000 * 86400 * 2 }, // TWO_DAILY
  { datefield: DateField.DATEFIELD_D, step: 7, spacing: 1000 * 604800 }, // WEEKLY
  // 1e3 * 60 * 60 * 24 * 365.2425 / 12
  { datefield: DateField.DATEFIELD_M, step: 1, spacing: 1000 * 7200 * 365.2425 }, // MONTHLY
  // 1e3 * 60 * 60 * 24 * 365.2425 / 4
  {
    datefield: DateField.DATEFIELD_M,
    step: 3,
    spacing: 1000 * 21600 * 365.2425,
  }, // QUARTERLY
  // 1e3 * 60 * 60 * 24 * 365.2425 / 2
  {
    datefield: DateField.DATEFIELD_M,
    step: 6,
    spacing: 1000 * 43200 * 365.2425,
  }, // BIANNUAL
  // 1e3 * 60 * 60 * 24 * 365.2425 * 1
  {
    datefield: DateField.DATEFIELD_Y,
    step: 1,
    spacing: 1000 * 86400 * 365.2425,
  }, // ANNUAL
  // 1e3 * 60 * 60 * 24 * 365.2425 * 10
  {
    datefield: DateField.DATEFIELD_Y,
    step: 10,
    spacing: 1000 * 864000 * 365.2425,
  }, // DECADAL
  // 1e3 * 60 * 60 * 24 * 365.2425 * 100
  {
    datefield: DateField.DATEFIELD_Y,
    step: 100,
    spacing: 1000 * 8640000 * 365.2425,
  }, // CENTENNIAL
];

/**
 * This is a list of human-friendly values at which to show tick marks on a log
 * scale. It is k * 10^n, where k=1..9 and n=-39..+39, so:
 * ..., 1, 2, 3, 4, 5, ..., 9, 10, 20, 30, ..., 90, 100, 200, 300, ...
 * NOTE: this assumes that utils.LOG_SCALE = 10.
 */
const PREFERRED_LOG_TICK_VALUES = (() => {
  const vals: number[] = [];
  for (let power = -39; power <= 39; power++) {
    const range = Math.pow(10, power);
    for (let mult = 1; mult <= 9; mult++) {
      vals.push(range * mult);
    }
  }
  return vals;
})();

/**
 * Determine the correct granularity of ticks on a date axis.
 *
 * @param a Left edge of the chart (ms)
 * @param b Right edge of the chart (ms)
 * @param pixels Size of the chart in the relevant dimension (width).
 * @param opts Function mapping from option name -&gt; value.
 * @return The appropriate axis granularity for this chart. See the
 *     enumeration of possible values in tickers.js.
 */
export const pickDateTickGranularity = (
  a: number,
  b: number,
  pixels: number,
  opts: AxisOpts,
): number => {
  const pixels_per_tick = opts("pixelsPerLabel") as number;
  for (let i = 0; i < Granularity.NUM_GRANULARITIES; i++) {
    const num_ticks = Math.round((b - a) / TICK_PLACEMENT[i]!.spacing);
    if (pixels / num_ticks >= pixels_per_tick) {
      return i;
    }
  }
  return -1;
};

/**
 * Compute the positions and labels of ticks on a date axis for a given granularity.
 * @param start_time
 * @param end_time
 * @param granularity (one of the granularities enumerated above)
 * @param opts Function mapping from option name -&gt; value.
 * @param dg
 * @return */
export const getDateAxis = (
  start_time: number,
  end_time: number,
  granularity: number,
  opts: AxisOpts,
  dg: unknown,
): TickResult => {
  const formatter = opts("axisLabelFormatter") as AxisLabelFormatter;
  const utc = opts("labelsUTC");
  const accessors = utc ? utils.DateAccessorsUTC : utils.DateAccessorsLocal;

  const placement = TICK_PLACEMENT[granularity]!;
  const datefield = placement.datefield;
  const step = placement.step;
  const spacing = placement.spacing;

  // Choose a nice tick position before the initial instant.
  // Currently, this code deals properly with the existent daily granularities:
  // DAILY (with step of 1) and WEEKLY (with step of 7 but specially handled).
  // Other daily granularities (say TWO_DAILY) should also be handled specially
  // by setting the start_date_offset to 0.
  const start_date = new Date(start_time);
  const date_array: DateParts = [0, 0, 0, 0, 0, 0, 0];
  date_array[DateField.DATEFIELD_Y] = accessors.getFullYear(start_date);
  date_array[DateField.DATEFIELD_M] = accessors.getMonth(start_date);
  date_array[DateField.DATEFIELD_D] = accessors.getDate(start_date);
  date_array[DateField.DATEFIELD_HH] = accessors.getHours(start_date);
  date_array[DateField.DATEFIELD_MM] = accessors.getMinutes(start_date);
  date_array[DateField.DATEFIELD_SS] = accessors.getSeconds(start_date);
  date_array[DateField.DATEFIELD_MS] = accessors.getMilliseconds(start_date);

  let start_date_offset = date_array[datefield]! % step;
  if (granularity === Granularity.WEEKLY) {
    // This will put the ticks on Sundays.
    start_date_offset = accessors.getDay(start_date);
  }

  date_array[datefield]! -= start_date_offset;
  for (let df = datefield + 1; df < DateField.NUM_DATEFIELDS; df++) {
    // The minimum value is 1 for the day of month, and 0 for all other fields.
    date_array[df] = df === DateField.DATEFIELD_D ? 1 : 0;
  }

  // Generate the ticks.
  // For granularities not coarser than HOURLY we use the fact that:
  //   the number of milliseconds between ticks is constant
  //   and equal to the defined spacing.
  // Otherwise we rely on the 'roll over' property of the Date functions:
  //   when some date field is set to a value outside of its logical range,
  //   the excess 'rolls over' the next (more significant) field.
  // However, when using local time with DST transitions,
  // there are dates that do not represent any time value at all
  // (those in the hour skipped at the 'spring forward'),
  // and the JavaScript engines usually return an equivalent value.
  // Hence we have to check that the date is properly increased at each step,
  // returning a date at a nice tick position.
  const ticks: NumericTick[] = [];
  let tick_date = accessors.makeDate(...date_array);
  let tick_time = tick_date.getTime();
  if (granularity <= Granularity.HOURLY) {
    if (tick_time < start_time) {
      tick_time += spacing;
      tick_date = new Date(tick_time);
    }
    while (tick_time <= end_time) {
      ticks.push({
        v: tick_time,
        label: formatter.call(dg, tick_date, granularity, opts, dg),
      });
      tick_time += spacing;
      tick_date = new Date(tick_time);
    }
  } else {
    if (tick_time < start_time) {
      date_array[datefield]! += step;
      tick_date = accessors.makeDate(...date_array);
      tick_time = tick_date.getTime();
    }
    while (tick_time <= end_time) {
      if (
        granularity >= Granularity.DAILY ||
        accessors.getHours(tick_date) % step === 0
      ) {
        ticks.push({
          v: tick_time,
          label: formatter.call(dg, tick_date, granularity, opts, dg),
        });
      }
      date_array[datefield]! += step;
      tick_date = accessors.makeDate(...date_array);
      tick_time = tick_date.getTime();
    }
  }
  return ticks as TickResult;
};

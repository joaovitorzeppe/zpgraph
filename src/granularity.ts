/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/** Time granularity enumeration for date-axis ticks and labels. */
export const Granularity = {
  MILLISECONDLY: 0,
  TWO_MILLISECONDLY: 1,
  FIVE_MILLISECONDLY: 2,
  TEN_MILLISECONDLY: 3,
  FIFTY_MILLISECONDLY: 4,
  HUNDRED_MILLISECONDLY: 5,
  FIVE_HUNDRED_MILLISECONDLY: 6,
  SECONDLY: 7,
  TWO_SECONDLY: 8,
  FIVE_SECONDLY: 9,
  TEN_SECONDLY: 10,
  THIRTY_SECONDLY: 11,
  MINUTELY: 12,
  TWO_MINUTELY: 13,
  FIVE_MINUTELY: 14,
  TEN_MINUTELY: 15,
  THIRTY_MINUTELY: 16,
  HOURLY: 17,
  TWO_HOURLY: 18,
  SIX_HOURLY: 19,
  DAILY: 20,
  TWO_DAILY: 21,
  WEEKLY: 22,
  MONTHLY: 23,
  QUARTERLY: 24,
  BIANNUAL: 25,
  ANNUAL: 26,
  DECADAL: 27,
  CENTENNIAL: 28,
  NUM_GRANULARITIES: 29,
} as const;

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

/**
 * Locale helpers for axis tick formatting.
 *
 *   import { applyLocale } from "zpgraph/extras/locale";
 *   applyLocale(g, { months: [...], weekdays: [...], decimalPoint: "," });
 */

import type { ZpgraphInstance } from "../internal-types";
import type { ZpgraphOptions } from "../types";

export type LocalePack = {
  months?: string[];
  weekdays?: string[];
  decimalPoint?: string;
  labelsUTC?: boolean;
};

export const applyLocale = (
  g: ZpgraphInstance,
  locale: LocalePack,
): void => {
  const opts: Partial<ZpgraphOptions> = {};
  if (locale.labelsUTC != null) {opts.labelsUTC = locale.labelsUTC;}
  // Decimal formatting is handled by digitsAfterDecimal / floatFormat;
  // expose pack on the instance for custom tickers.
  (g as { locale_?: LocalePack }).locale_ = locale;
  g.updateOptions(opts);
};

export default { applyLocale };

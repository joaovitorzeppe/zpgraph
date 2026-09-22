/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

/**
 * Locale helpers and named packs for axis / toolbar labels.
 *
 *   import { applyLocale, packs } from "zpgraph/extras/locale";
 *   applyLocale(g, packs.pt);
 */

import type { ZpgraphInstance } from "../internal-types";
import type { ToolbarOptions, ZpgraphOptions } from "../types";

export type LocalePack = {
  months?: string[];
  weekdays?: string[];
  decimalPoint?: string;
  labelsUTC?: boolean;
  /** Toolbar button labels (i18n). */
  toolbar?: NonNullable<ToolbarOptions["labels"]>;
};

export const packs = {
  pt: {
    months: [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ],
    weekdays: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
    decimalPoint: ",",
    labelsUTC: true,
    toolbar: {
      zoomin: "Aproximar",
      zoomout: "Afastar",
      pan: "Panorâmica",
      reset: "Redefinir",
      downloadPng: "PNG",
      downloadCsv: "CSV",
      copyCsv: "Copiar CSV",
    },
  } satisfies LocalePack,
  en: {
    months: [
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
    ],
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    decimalPoint: ".",
    labelsUTC: true,
    toolbar: {
      zoomin: "Zoom in",
      zoomout: "Zoom out",
      pan: "Pan",
      reset: "Reset",
      downloadPng: "PNG",
      downloadCsv: "CSV",
      copyCsv: "Copy CSV",
    },
  } satisfies LocalePack,
  es: {
    months: [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ],
    weekdays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
    decimalPoint: ",",
    labelsUTC: true,
    toolbar: {
      zoomin: "Acercar",
      zoomout: "Alejar",
      pan: "Desplazar",
      reset: "Restablecer",
      downloadPng: "PNG",
      downloadCsv: "CSV",
      copyCsv: "Copiar CSV",
    },
  } satisfies LocalePack,
} as const;

const isToolbarOptions = (v: unknown): v is ToolbarOptions =>
  typeof v === "object" && v !== null;

export const applyLocale = (g: ZpgraphInstance, locale: LocalePack): void => {
  const opts: Partial<ZpgraphOptions> = {};
  if (locale.labelsUTC != null) {
    opts.labelsUTC = locale.labelsUTC;
  }
  if (locale.toolbar) {
    const prev = g.getOption("toolbar");
    if (isToolbarOptions(prev)) {
      opts.toolbar = {
        ...prev,
        labels: { ...prev.labels, ...locale.toolbar },
      };
    } else if (prev === true || prev == null) {
      opts.toolbar = { labels: { ...locale.toolbar } };
    }
  }
  Object.assign(g, { locale_: locale });
  g.updateOptions(opts);
};

export default { applyLocale, packs };

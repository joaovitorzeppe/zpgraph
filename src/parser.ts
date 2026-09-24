/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Turns what the user handed us — a CSV string or a native array — into
 * rawData_, and picks the x-axis defaults that match it.
 */

import * as utils from "./utils";
import { log } from "./logger";
import * as ZpgraphTickers from "./tickers";
import type {
  AxisLabelFormatter,
  AxisOptions,
  DataArray,
  ValueFormatter,
} from "./types";
import type { RawData, RawDataCell, RawDataRow } from "./internal-types";
import type Zpgraph from "./zpgraph";

const xAxisOpts = (g: Zpgraph): AxisOptions => {
  if (!g.attrs_.axes) {
    g.attrs_.axes = {};
  }
  if (!g.attrs_.axes.x) {
    g.attrs_.axes.x = {};
  }
  return g.attrs_.axes.x;
};

const numericValueFormatter: ValueFormatter = (x) => String(x);

const numericAxisLabelFormatter: AxisLabelFormatter = (x) =>
  String(typeof x === "number" ? x : x.valueOf());

const dateAxisLabel: AxisLabelFormatter = (value, granularity, opts) => {
  const date = value instanceof Date ? value : new Date(value);
  return utils.dateAxisLabelFormatter(date, granularity, opts);
};

const numberAxisLabel: AxisLabelFormatter = (value, granularity, opts) => {
  const x = typeof value === "number" ? value : value.valueOf();
  return utils.numberAxisLabelFormatter(x, granularity, opts);
};

const xCellNumber = (cell: RawDataCell | undefined): number | null => {
  if (typeof cell === "number") {
    return cell;
  }
  if (utils.isDateLike(cell)) {
    return cell.getTime();
  }
  return null;
};

const parseXCell = (value: unknown): RawDataCell => {
  if (typeof value === "number" || value === null) {
    return value;
  }
  if (utils.isDateLike(value)) {
    return value.getTime();
  }
  return null;
};

/**
 * Detects the type of the str (date or numeric) and sets the various
 * formatting attributes in g.attrs_ based on this type.
 * @param str An x value.
 * @private
 */
export const detectTypeFromString = (g: Zpgraph, str: string): void => {
  let isDate = false;
  const dashPos = str.indexOf("-"); // could be 2006-01-01 _or_ 1.0e-2
  if (
    (dashPos > 0 && str[dashPos - 1] !== "e" && str[dashPos - 1] !== "E") ||
    str.includes("/") ||
    isNaN(parseFloat(str))
  ) {
    isDate = true;
  }

  setXAxisOptions(g, isDate);
};

export const setXAxisOptions = (g: Zpgraph, isDate: boolean): void => {
  const xAxis = xAxisOpts(g);
  if (isDate) {
    g.attrs_.xValueParser = utils.dateParser;
    xAxis.valueFormatter = utils.dateValueFormatter;
    xAxis.ticker = ZpgraphTickers.dateTicker;
    xAxis.axisLabelFormatter = dateAxisLabel;
  } else {
    /** @private (shut up, jsdoc!) */
    g.attrs_.xValueParser = (x: string): number => {
      return parseFloat(x);
    };
    /** @private (shut up, jsdoc!) */
    xAxis.valueFormatter = numericValueFormatter;
    xAxis.ticker = ZpgraphTickers.numericTicks;
    xAxis.axisLabelFormatter = numericAxisLabelFormatter;
  }
};

const csvLineDelimiter = (data: string): string => {
  let inQuotes = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === '"') {
      if (inQuotes && data[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) {
      continue;
    }
    if (c === "\r") {
      return data[i + 1] === "\n" ? "\r\n" : "\r";
    }
    if (c === "\n") {
      return data[i + 1] === "\r" ? "\n\r" : "\n";
    }
  }
  return "\n";
};

const csvLines = (data: string): string[] => {
  if (!data.includes('"')) {
    return data.split(utils.detectLineDelimiter(data) || "\n");
  }
  const delim = csvLineDelimiter(data);
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === '"') {
      if (inQuotes && data[i + 1] === '"') {
        cur += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      cur += c;
      continue;
    }
    if (!inQuotes && data.startsWith(delim, i)) {
      lines.push(cur);
      cur = "";
      i += delim.length - 1;
      continue;
    }
    cur += c;
  }
  lines.push(cur);
  return lines;
};

const csvFields = (line: string, delim: string): string[] => {
  if (!line.includes('"')) {
    return line.split(delim);
  }
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (line.startsWith(delim, i)) {
      fields.push(cur);
      cur = "";
      i += delim.length - 1;
      continue;
    }
    cur += c;
  }
  fields.push(cur);
  return fields;
};

/**
 * @private
 * Parses a string in a special csv format.  We expect a csv file where each
 * line is a date point, and the first field in each line is the date string.
 * We also expect that all remaining fields represent series.
 * if the errorBars attribute is set, then interpret the fields as:
 * date, series1, stddev1, series2, stddev2, ...
 * @param data See above.
 *
 * @return [Object] An array with one entry for each row. These entries
 * are an array of cells in that row. The first entry is the parsed x-value for
 * the row. The second, third, etc. are the y-values. These can take on one of
 * three forms, depending on the CSV and constructor parameters:
 * 1. numeric value
 * 2. [ value, stddev ]
 * 3. [ low value, center value, high value ]
 */
export const parseCSV = (g: Zpgraph, data: string): RawData => {
  const csv = data.charCodeAt(0) === 0xfeff ? data.slice(1) : data;
  const ret: RawData = [];
  const lines = csvLines(csv);
  let vals: string[], j: number;

  // Use the default delimiter or fall back to a tab if that makes sense.
  let delim = g.getStringOption("delimiter");
  const firstLine = lines[0];
  if (firstLine && !firstLine.includes(delim) && firstLine.includes("\t")) {
    delim = "\t";
  }

  let start = 0;
  if (!("labels" in g.user_attrs_)) {
    // User hasn't explicitly set labels, so they're (presumably) in the CSV.
    start = 1;
    g.attrs_.labels = csvFields(firstLine!, delim); // NOTE: _not_ user_attrs_.
    g.attributes_.reparseSeries();
  }
  let xParser: ((...args: unknown[]) => unknown) | undefined;
  let defaultParserSet = false; // attempt to auto-detect x value type
  const expectedCols = g.getLabels()?.length ?? 0;
  let outOfOrder = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) {
      continue;
    } // skip blank lines
    if (line[0] === "#") {
      continue;
    } // skip comment lines
    const inFields = csvFields(line, delim);
    if (inFields.length < 2) {
      continue;
    }

    const fields: RawDataRow = [];
    if (!defaultParserSet) {
      detectTypeFromString(g, inFields[0]!);
      xParser = g.getFunctionOption("xValueParser");
      defaultParserSet = true;
    }
    fields[0] = parseXCell(xParser!(inFields[0]!, g));

    // If fractions are expected, parse the numbers as "A/B"
    if (g.fractions_) {
      for (j = 1; j < inFields.length; j++) {
        vals = inFields[j]!.split("/");
        if (vals.length !== 2) {
          log.error(
            'Expected fractional "num/den" values in CSV data ' +
              "but found a value '" +
              inFields[j] +
              "' on line " +
              (1 + i) +
              " ('" +
              line +
              "') which is not of this form.",
          );
          fields[j] = [0, 0];
        } else {
          fields[j] = [
            utils.parseFloat_(vals[0]!, i, line),
            utils.parseFloat_(vals[1]!, i, line),
          ];
        }
      }
    } else if (g.getBooleanOption("errorBars")) {
      // If there are sigma-based high/low bands, values are (value, stddev) pairs
      if (inFields.length % 2 !== 1) {
        log.error(
          "Expected alternating (value, stdev.) pairs in CSV data " +
            "but line " +
            (1 + i) +
            " has an odd number of values (" +
            (inFields.length - 1) +
            "): '" +
            line +
            "'",
        );
      }
      for (j = 1; j < inFields.length; j += 2) {
        fields[(j + 1) / 2] = [
          utils.parseFloat_(inFields[j]!, i, line),
          utils.parseFloat_(inFields[j + 1]!, i, line),
        ];
      }
    } else if (g.getBooleanOption("customBars")) {
      // Custom high/low bands are a low;centre;high tuple
      for (j = 1; j < inFields.length; j++) {
        const val = inFields[j]!;
        if (/^ *$/.test(val)) {
          fields[j] = [null, null, null];
        } else {
          vals = val.split(";");
          if (vals.length === 3) {
            fields[j] = [
              utils.parseFloat_(vals[0]!, i, line),
              utils.parseFloat_(vals[1]!, i, line),
              utils.parseFloat_(vals[2]!, i, line),
            ];
          } else {
            log.warn(
              "When using customBars, values must be either blank " +
                'or "low;center;high" tuples (got "' +
                val +
                '" on line ' +
                (1 + i) +
                ")",
            );
            fields[j] = [null, null, null];
          }
        }
      }
    } else {
      // Values are just numbers
      for (j = 1; j < inFields.length; j++) {
        fields[j] = utils.parseFloat_(inFields[j]!, i, line);
      }
    }
    const prevRow = ret[ret.length - 1];
    const curX = xCellNumber(fields[0]);
    const prevX = prevRow ? xCellNumber(prevRow[0]) : null;
    if (
      ret.length > 0 &&
      curX !== null &&
      prevX !== null &&
      curX < prevX
    ) {
      outOfOrder = true;
    }

    if (fields.length !== expectedCols) {
      log.error(
        "Number of columns in line " +
          i +
          " (" +
          fields.length +
          ") does not agree with number of labels (" +
          expectedCols +
          ") " +
          line,
      );
    }

    // If the user specified the 'labels' option and none of the cells of the
    // first row parsed correctly, then they probably double-specified the
    // labels. We go with the values set in the option, discard this row and
    // log a warning to the JS console.
    if (i === 0 && g.attr_("labels")) {
      let all_null = true;
      for (j = 0; all_null && j < fields.length; j++) {
        if (fields[j]) {
          all_null = false;
        }
      }
      if (all_null) {
        log.warn(
          "The zpgraph 'labels' option is set, but the first row " +
            "of CSV data ('" +
            line +
            "') appears to also contain " +
            "labels. Will drop the CSV labels and use the option " +
            "labels.",
        );
        continue;
      }
    }
    ret.push(fields);
  }

  if (outOfOrder) {
    log.warn("CSV is out of order; order it correctly to speed loading.");
    ret.sort((a: RawDataRow, b: RawDataRow) => {
      return (xCellNumber(a[0]) ?? 0) - (xCellNumber(b[0]) ?? 0);
    });
  }

  return ret;
};

/**
 * In native format, all values must be dates or numbers.
 * This check isn't perfect but will catch most mistaken uses of strings.
 * @private
 */
export const validateNativeFormat = (data: DataArray): void => {
  const firstRow = data[0]!;
  const firstX = firstRow[0];
  if (typeof firstX !== "number" && !utils.isDateLike(firstX)) {
    throw new Error(
      `Expected number or date but got ${typeof firstX}: ${String(firstX)}.`,
    );
  }
  for (let i = 1; i < firstRow.length; i++) {
    const val = firstRow[i];
    if (val === null || val === undefined) {
      continue;
    }
    if (typeof val === "number") {
      continue;
    }
    if (utils.isArrayLike(val)) {
      continue;
    } // e.g. errorBars or customBars
    throw new Error(`Expected number or array but got ${typeof val}: ${String(val)}.`);
  }
};

/**
 * The user has provided their data as a pre-packaged JS array. If the x values
 * are numeric, this is the same as zpgraph' internal format. If the x values
 * are dates, we need to convert them from Date objects to ms since epoch.
 * @param data
 * @return data with numeric x values.
 * @private
 */
export const parseArray = (
  g: Zpgraph,
  data: DataArray,
): RawData | DataArray | null => {
  // Peek at the first x value to see if it's numeric.
  if (data.length === 0) {
    data = [[0]];
  }
  if (data[0]!.length === 0) {
    log.error("Data set cannot contain an empty row");
    return null;
  }

  validateNativeFormat(data);

  let i: number;
  if (g.attr_("labels") === null) {
    log.warn(
      "Using default labels. Set labels explicitly via 'labels' " +
        "in the options parameter",
    );
    g.attrs_.labels = ["X"];
    for (i = 1; i < data[0]!.length; i++) {
      g.attrs_.labels.push("Y" + i); // Not user_attrs_.
    }
    g.attributes_.reparseSeries();
  } else {
    const num_labels = g.getLabels();
    if (!num_labels || num_labels.length !== data[0]!.length) {
      log.error(
        "Mismatch between number of labels (" +
          (num_labels?.length ?? 0) +
          ")" +
          " and number of columns in array (" +
          data[0]!.length +
          ")",
      );
      return null;
    }
  }

  if (utils.isDateLike(data[0]![0])) {
    // Some intelligent defaults for a date x-axis.
    const xAxis = xAxisOpts(g);
    xAxis.valueFormatter = utils.dateValueFormatter;
    xAxis.ticker = ZpgraphTickers.dateTicker;
    xAxis.axisLabelFormatter = dateAxisLabel;

    // Assume they're all dates.
    const parsedData = utils.clone(data);
    for (i = 0; i < data.length; i++) {
      if (parsedData[i]!.length === 0) {
        log.error("Row " + (1 + i) + " of data is empty");
        return null;
      }
      const xVal = parsedData[i]![0];
      if (!utils.isDateLike(xVal)) {
        log.error("x value in row " + (1 + i) + " is not a Date");
        return null;
      }
      const time = xVal.getTime();
      if (isNaN(time)) {
        log.error("x value in row " + (1 + i) + " is not a Date");
        return null;
      }
      parsedData[i]![0] = time;
    }
    return parsedData;
  }
  // Some intelligent defaults for a numeric x-axis.
  const xAxis = xAxisOpts(g);
  xAxis.valueFormatter = numericValueFormatter;
  xAxis.ticker = ZpgraphTickers.numericTicks;
  xAxis.axisLabelFormatter = numberAxisLabel;
  return data;
};

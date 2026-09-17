/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Turns what the user handed us — a CSV string, a native array or a gviz
 * DataTable — into rawData_, and picks the x-axis defaults that match it.
 */

import * as utils from "./utils";
import { log } from "./logger";
import * as ZpgraphTickers from "./tickers";
import type {
  Annotation,
  AxisLabelFormatter,
  AxisOptions,
  DataArray,
  ValueFormatter,
} from "./types";
import type { RawData, RawDataCell, RawDataRow } from "./internal-types";
import type Zpgraph from "./zpgraph";

/** Minimal gviz DataTable surface used by parseDataTable. */
interface GvizDataTable {
  getNumberOfColumns(): number;
  getNumberOfRows(): number;
  getColumnType(col: number): string;
  getColumnLabel(col: number): string;
  getValue(row: number, col: number): unknown;
}

type PendingAnnotation = Pick<Annotation, "series" | "shortText" | "text"> & {
  xval: number;
};

const xAxisOpts = (g: Zpgraph): AxisOptions => {
  if (!g.attrs_.axes) {
    g.attrs_.axes = {};
  }
  if (!g.attrs_.axes.x) {
    g.attrs_.axes.x = {};
  }
  return g.attrs_.axes.x;
};

const numericValueFormatter = ((x: number) => x) as unknown as ValueFormatter;

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
    xAxis.axisLabelFormatter =
      utils.dateAxisLabelFormatter as AxisLabelFormatter;
  } else {
    /** @private (shut up, jsdoc!) */
    g.attrs_.xValueParser = (x: string): number => {
      return parseFloat(x);
    };
    /** @private (shut up, jsdoc!) */
    xAxis.valueFormatter = numericValueFormatter;
    xAxis.ticker = ZpgraphTickers.numericTicks;
    xAxis.axisLabelFormatter =
      xAxis.valueFormatter as unknown as AxisLabelFormatter;
  }
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
  const ret: RawData = [];
  const line_delimiter = utils.detectLineDelimiter(data);
  const lines = data.split(line_delimiter || "\n");
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
    g.attrs_.labels = firstLine!.split(delim); // NOTE: _not_ user_attrs_.
    g.attributes_.reparseSeries();
  }
  let xParser: ((...args: unknown[]) => unknown) | undefined;
  let defaultParserSet = false; // attempt to auto-detect x value type
  const expectedCols = (g.attr_("labels") as string[]).length;
  let outOfOrder = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) {
      continue;
    } // skip blank lines
    if (line[0] === "#") {
      continue;
    } // skip comment lines
    const inFields = line.split(delim);
    if (inFields.length < 2) {
      continue;
    }

    const fields: RawDataRow = [];
    if (!defaultParserSet) {
      detectTypeFromString(g, inFields[0]!);
      xParser = g.getFunctionOption("xValueParser");
      defaultParserSet = true;
    }
    fields[0] = xParser!(inFields[0]!, g) as RawDataCell;

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
          ] as RawDataCell;
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
        ] as RawDataCell;
      }
    } else if (g.getBooleanOption("customBars")) {
      // Custom high/low bands are a low;centre;high tuple
      for (j = 1; j < inFields.length; j++) {
        const val = inFields[j]!;
        if (/^ *$/.test(val)) {
          fields[j] = [null, null, null] as unknown as RawDataCell;
        } else {
          vals = val.split(";");
          if (vals.length === 3) {
            fields[j] = [
              utils.parseFloat_(vals[0]!, i, line),
              utils.parseFloat_(vals[1]!, i, line),
              utils.parseFloat_(vals[2]!, i, line),
            ] as RawDataCell;
          } else {
            log.warn(
              "When using customBars, values must be either blank " +
                'or "low;center;high" tuples (got "' +
                val +
                '" on line ' +
                (1 + i) +
                ")",
            );
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
    if (
      ret.length > 0 &&
      prevRow &&
      (fields[0] as number) < (prevRow[0] as number)
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
      return (a[0] as number) - (b[0] as number);
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
      `Expected number or date but got ${typeof firstX}: ${firstX}.`,
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
    throw new Error(`Expected number or array but got ${typeof val}: ${val}.`);
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
    const num_labels = g.attr_("labels") as string[];
    if (num_labels.length !== data[0]!.length) {
      log.error(
        "Mismatch between number of labels (" +
          num_labels.length +
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
    xAxis.axisLabelFormatter =
      utils.dateAxisLabelFormatter as AxisLabelFormatter;

    // Assume they're all dates.
    const parsedData = utils.clone(data) as RawData;
    for (i = 0; i < data.length; i++) {
      if (parsedData[i]!.length === 0) {
        log.error("Row " + (1 + i) + " of data is empty");
        return null;
      }
      const xVal = parsedData[i]![0];
      if (
        xVal === null ||
        typeof (xVal as Date).getTime != "function" ||
        isNaN((xVal as Date).getTime())
      ) {
        log.error("x value in row " + (1 + i) + " is not a Date");
        return null;
      }
      parsedData[i]![0] = (xVal as Date).getTime();
    }
    return parsedData;
  }
  // Some intelligent defaults for a numeric x-axis.
  const xAxis = xAxisOpts(g);
  xAxis.valueFormatter = numericValueFormatter;
  xAxis.ticker = ZpgraphTickers.numericTicks;
  xAxis.axisLabelFormatter =
    utils.numberAxisLabelFormatter as AxisLabelFormatter;
  return data;
};

const shortTextForAnnotationNum = (num: number): string => {
  // converts [0-9]+ [A-Z][a-z]*
  // example: 0=A, 1=B, 25=Z, 26=Aa, 27=Ab
  // and continues like.. Ba Bb .. Za .. Zz..Aaa...Zzz Aaaa Zzzz
  let shortText = String.fromCharCode(65 /* A */ + (num % 26));
  num = Math.floor(num / 26);
  while (num > 0) {
    shortText =
      String.fromCharCode(65 /* A */ + ((num - 1) % 26)) +
      shortText.toLowerCase();
    num = Math.floor((num - 1) / 26);
  }
  return shortText;
};

/**
 * Parses a DataTable object from gviz.
 * The data is expected to have a first column that is either a date or a
 * number. All subsequent columns must be numbers. If there is a clear mismatch
 * between g.xValueParser_ and the type of the first column, it will be
 * fixed. Fills out rawData_.
 * @param data See above.
 * @private
 */
export const parseDataTable = (g: Zpgraph, data: GvizDataTable): void => {
  const cols = data.getNumberOfColumns();
  const rows = data.getNumberOfRows();

  const indepType = data.getColumnType(0);
  if (indepType === "date" || indepType === "datetime") {
    g.attrs_.xValueParser = utils.dateParser;
    const xAxis = xAxisOpts(g);
    xAxis.valueFormatter = utils.dateValueFormatter;
    xAxis.ticker = ZpgraphTickers.dateTicker;
    xAxis.axisLabelFormatter =
      utils.dateAxisLabelFormatter as AxisLabelFormatter;
  } else if (indepType === "number") {
    g.attrs_.xValueParser = (x: string): number => {
      return parseFloat(x);
    };
    const xAxis = xAxisOpts(g);
    xAxis.valueFormatter = numericValueFormatter;
    xAxis.ticker = ZpgraphTickers.numericTicks;
    xAxis.axisLabelFormatter =
      xAxis.valueFormatter as unknown as AxisLabelFormatter;
  } else {
    throw new Error(
      "only 'date', 'datetime' and 'number' types are supported " +
        "for column 1 of DataTable input (Got '" +
        indepType +
        "')",
    );
  }

  // Array of the column indices which contain data (and not annotations).
  const colIdx: number[] = [];
  const annotationCols: Record<number, number[]> = {}; // data index -> [annotation cols]
  let hasAnnotations = false;
  let i: number, j: number;
  for (i = 1; i < cols; i++) {
    const type = data.getColumnType(i);
    if (type === "number") {
      colIdx.push(i);
    } else if (type === "string" && g.getBooleanOption("displayAnnotations")) {
      // This is OK -- it's an annotation column.
      const dataIdx = colIdx[colIdx.length - 1]!;
      if (!Object.hasOwn(annotationCols, dataIdx)) {
        annotationCols[dataIdx] = [i];
      } else {
        annotationCols[dataIdx]!.push(i);
      }
      hasAnnotations = true;
    } else {
      throw new Error(
        "Only 'number' is supported as a dependent type with Gviz." +
          " 'string' is only supported if displayAnnotations is true",
      );
    }
  }

  // Read column labels
  const labels = [data.getColumnLabel(0)];
  for (i = 0; i < colIdx.length; i++) {
    labels.push(data.getColumnLabel(colIdx[i]!));
    if (g.getBooleanOption("errorBars")) {
      i += 1;
    }
  }
  g.attrs_.labels = labels;
  const colCount = labels.length;

  const ret: RawData = [];
  let outOfOrder = false;
  const annotations: PendingAnnotation[] = [];
  for (i = 0; i < rows; i++) {
    const row: RawDataRow = [];
    if (
      typeof data.getValue(i, 0) === "undefined" ||
      data.getValue(i, 0) === null
    ) {
      log.warn(
        "Ignoring row " +
          i +
          " of DataTable because of undefined or null first column.",
      );
      continue;
    }

    if (indepType === "date" || indepType === "datetime") {
      const xVal = data.getValue(i, 0);
      row.push((xVal as Date).getTime());
    } else {
      row.push(data.getValue(i, 0) as number);
    }
    if (!g.getBooleanOption("errorBars")) {
      for (j = 0; j < colIdx.length; j++) {
        const col = colIdx[j]!;
        row.push(data.getValue(i, col) as number | null);
        const annCols = annotationCols[col];
        if (
          hasAnnotations &&
          annCols &&
          data.getValue(i, annCols[0]!) !== null
        ) {
          const ann: PendingAnnotation = {
            series: data.getColumnLabel(col),
            xval: row[0] as number,
            shortText: shortTextForAnnotationNum(annotations.length),
            text: "",
          };
          for (let k = 0; k < annCols.length; k++) {
            if (k) {
              ann.text += "\n";
            }
            ann.text += String(data.getValue(i, annCols[k]!));
          }
          annotations.push(ann);
        }
      }

      // Strip out infinities, which give zpgraph problems later on.
      for (j = 0; j < row.length; j++) {
        if (!isFinite(row[j] as number)) {
          row[j] = null;
        }
      }
    } else {
      for (j = 0; j < colCount - 1; j++) {
        row.push([
          data.getValue(i, 1 + 2 * j) as number,
          data.getValue(i, 2 + 2 * j) as number,
        ]);
      }
    }
    const prevRow = ret[ret.length - 1];
    if (
      ret.length > 0 &&
      prevRow &&
      (row[0] as number) < (prevRow[0] as number)
    ) {
      outOfOrder = true;
    }
    ret.push(row);
  }

  if (outOfOrder) {
    log.warn("DataTable is out of order; order it correctly to speed loading.");
    ret.sort((a: RawDataRow, b: RawDataRow) => {
      return (a[0] as number) - (b[0] as number);
    });
  }
  g.rawData_ = ret;

  if (annotations.length > 0) {
    g.setAnnotations(annotations as unknown as Annotation[], true);
  }
  g.attributes_.reparseSeries();
};

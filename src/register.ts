/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZpgraphCanvasRenderer from "./canvas";
import ZpgraphInteraction from "./interaction-model";
import * as ZpgraphTickers from "./tickers";
import * as utils from "./utils";

import DefaultHandler from "./datahandler/default";
import ErrorBarsHandler from "./datahandler/bars-error";
import CustomBarsHandler from "./datahandler/bars-custom";
import DefaultFractionHandler from "./datahandler/default-fractions";
import FractionsBarsHandler from "./datahandler/bars-fractions";
import BarsHandler from "./datahandler/bars";

import AnnotationsPlugin from "./plugins/annotations";
import AxesPlugin from "./plugins/axes";
import ChartAnnotationsPlugin from "./plugins/chart-annotations";
import ChartLabelsPlugin from "./plugins/chart-labels";
import DataLabelsPlugin from "./plugins/data-labels";
import GridPlugin from "./plugins/grid";
import LegendPlugin from "./plugins/legend";
import RangeSelectorPlugin from "./plugins/range-selector";
import StatusOverlayPlugin from "./plugins/status-overlay";
import ThresholdsPlugin from "./plugins/thresholds";
import ToolbarPlugin from "./plugins/toolbar";

type DomReadyHost = {
  onDOMready?: (cb: () => void) => boolean;
};

/** Static bag mutated onto the Zpgraph constructor. */
type ZpgraphStaticsBag = DomReadyHost & {
  NAME?: string;
  VERSION?: string;
  DEFAULT_ROLL_PERIOD?: number;
  DEFAULT_WIDTH?: number;
  DEFAULT_HEIGHT?: number;
  Plotters?: typeof ZpgraphCanvasRenderer._Plotters;
  addedAnnotationCSS?: boolean;
  PLUGINS?: unknown[];
  DOTTED_LINE?: typeof utils.DOTTED_LINE;
  DASHED_LINE?: typeof utils.DASHED_LINE;
  DOT_DASH_LINE?: typeof utils.DOT_DASH_LINE;
  dateAxisLabelFormatter?: typeof utils.dateAxisLabelFormatter;
  findPos?: typeof utils.findPos;
  pageX?: typeof utils.pageX;
  pageY?: typeof utils.pageY;
  defaultInteractionModel?: typeof ZpgraphInteraction.defaultModel;
  nonInteractiveModel?: typeof ZpgraphInteraction.nonInteractiveModel_;
  Circles?: typeof utils.Circles;
  Plugins?: Record<string, unknown>;
  DataHandlers?: Record<string, unknown>;
  startPan?: typeof ZpgraphInteraction.startPan;
  startZoom?: typeof ZpgraphInteraction.startZoom;
  movePan?: typeof ZpgraphInteraction.movePan;
  moveZoom?: typeof ZpgraphInteraction.moveZoom;
  endPan?: typeof ZpgraphInteraction.endPan;
  endZoom?: typeof ZpgraphInteraction.endZoom;
  numericLinearTicks?: typeof ZpgraphTickers.numericLinearTicks;
  numericTicks?: typeof ZpgraphTickers.numericTicks;
  integerTicks?: typeof ZpgraphTickers.integerTicks;
  dateTicker?: typeof ZpgraphTickers.dateTicker;
  Granularity?: typeof ZpgraphTickers.Granularity;
  pickDateTickGranularity?: typeof ZpgraphTickers.pickDateTickGranularity;
  getDateAxis?: typeof ZpgraphTickers.getDateAxis;
  floatFormat?: typeof utils.floatFormat;
};

/** Every object can hold the optional onDOMready slot used by setupDOMready_. */
const isStaticsBag = (_v: object): _v is ZpgraphStaticsBag => true;

export const registerZpgraphStatics = (Zpgraph: object): void => {
  if (!isStaticsBag(Zpgraph)) {
    return;
  }
  const Z = Zpgraph;

  Z.NAME = "Zpgraph";
  Z.VERSION = "0.1.0";

  // Various default values
  Z.DEFAULT_ROLL_PERIOD = 1;
  Z.DEFAULT_WIDTH = 480;
  Z.DEFAULT_HEIGHT = 320;

  /**
   * Standard plotters. These may be used by clients.
   * Available plotters are:
   * - Zpgraph.Plotters.linePlotter: draws central lines (most common)
   * - Zpgraph.Plotters.errorPlotter: draws high/low bands
   * - Zpgraph.Plotters.fillPlotter: draws fills under lines (used with fillGraph)
   *
   * By default, the plotter is [fillPlotter, errorPlotter, linePlotter].
   * This causes all the lines to be drawn over all the fills/bands.
   */
  Z.Plotters = ZpgraphCanvasRenderer._Plotters;

  // Used for initializing annotation CSS rules only once.
  Z.addedAnnotationCSS = false;

  // Installed plugins, in order of precedence (most-general to most-specific).
  // This means that, in an event cascade, plugins which have registered
  // for that event will be called in reverse order.
  //
  // This is most relevant for plugins which register a layout event,
  // e.g. Axes, Legend and ChartLabels.
  Z.PLUGINS = [
    LegendPlugin,
    AxesPlugin,
    RangeSelectorPlugin, // Has to be before ChartLabels so that its callbacks are called after ChartLabels' callbacks.
    ChartLabelsPlugin,
    AnnotationsPlugin,
    ThresholdsPlugin,
    ChartAnnotationsPlugin,
    DataLabelsPlugin,
    ToolbarPlugin,
    StatusOverlayPlugin,
    GridPlugin,
  ];

  // Symbols historically available through the chart class.
  Z.DOTTED_LINE = utils.DOTTED_LINE;
  Z.DASHED_LINE = utils.DASHED_LINE;
  Z.DOT_DASH_LINE = utils.DOT_DASH_LINE;
  Z.dateAxisLabelFormatter = utils.dateAxisLabelFormatter;
  Z.findPos = utils.findPos;
  Z.pageX = utils.pageX;
  Z.pageY = utils.pageY;
  Z.defaultInteractionModel = ZpgraphInteraction.defaultModel;
  Z.nonInteractiveModel = ZpgraphInteraction.nonInteractiveModel_;
  Z.Circles = utils.Circles;

  Z.Plugins = {
    Legend: LegendPlugin,
    Axes: AxesPlugin,
    Annotations: AnnotationsPlugin,
    ChartLabels: ChartLabelsPlugin,
    Grid: GridPlugin,
    RangeSelector: RangeSelectorPlugin,
    Thresholds: ThresholdsPlugin,
    ChartAnnotations: ChartAnnotationsPlugin,
    DataLabels: DataLabelsPlugin,
    Toolbar: ToolbarPlugin,
    StatusOverlay: StatusOverlayPlugin,
  };

  Z.DataHandlers = {
    DefaultHandler,
    BarsHandler,
    CustomBarsHandler,
    DefaultFractionHandler,
    ErrorBarsHandler,
    FractionsBarsHandler,
  };

  Z.startPan = ZpgraphInteraction.startPan;
  Z.startZoom = ZpgraphInteraction.startZoom;
  Z.movePan = ZpgraphInteraction.movePan;
  Z.moveZoom = ZpgraphInteraction.moveZoom;
  Z.endPan = ZpgraphInteraction.endPan;
  Z.endZoom = ZpgraphInteraction.endZoom;

  Z.numericLinearTicks = ZpgraphTickers.numericLinearTicks;
  Z.numericTicks = ZpgraphTickers.numericTicks;
  Z.integerTicks = ZpgraphTickers.integerTicks;
  Z.dateTicker = ZpgraphTickers.dateTicker;
  Z.Granularity = ZpgraphTickers.Granularity;
  Z.pickDateTickGranularity = ZpgraphTickers.pickDateTickGranularity;
  Z.getDateAxis = ZpgraphTickers.getDateAxis;
  Z.floatFormat = utils.floatFormat;

  utils.setupDOMready_(Z);
};

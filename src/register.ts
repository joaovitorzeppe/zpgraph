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
import ChartLabelsPlugin from "./plugins/chart-labels";
import GridPlugin from "./plugins/grid";
import LegendPlugin from "./plugins/legend";
import RangeSelectorPlugin from "./plugins/range-selector";

type ZpgraphStaticsTarget = Record<string, unknown> & {
  new (div: unknown, data: unknown, opts?: unknown): unknown;
  PLUGINS?: unknown[];
  Plugins?: Record<string, unknown>;
  DataHandlers?: Record<string, unknown>;
};

export const registerZpgraphStatics = (Zpgraph: unknown): void => {
  const Z = Zpgraph as ZpgraphStaticsTarget;

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

  utils.setupDOMready_(
    Z as unknown as Parameters<typeof utils.setupDOMready_>[0],
  );
};

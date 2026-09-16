'use strict';

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import * as ZgraphTickers from './tickers';
import ZgraphInteraction from './interaction-model';
import ZgraphCanvasRenderer from './canvas';
import * as utils from './utils';

// Default attribute values.
let DEFAULT_ATTRS = {
  highlightCircleSize: 3,
  highlightSeriesOpts: null,
  highlightSeriesBackgroundAlpha: 0.5,
  highlightSeriesBackgroundColor: 'rgb(255, 255, 255)',

  labelsSeparateLines: false,
  labelsShowZeroValues: true,
  labelsKMB: false,
  labelsKMG2: false,
  showLabelsOnHighlight: true,

  digitsAfterDecimal: 2,
  maxNumberWidth: 6,
  sigFigs: null,

  strokeWidth: 1.0,
  strokeBorderWidth: 0,
  strokeBorderColor: 'white',

  axisTickSize: 3,
  axisLabelFontSize: 14,
  rightGap: 5,

  showRoller: false,
  xValueParser: undefined,

  delimiter: ',',

  sigma: 2.0,
  errorBars: false,
  fractions: false,
  wilsonInterval: true, // only relevant if fractions is true
  customBars: false,
  fillGraph: false,
  fillAlpha: 0.15,
  connectSeparatedPoints: false,

  stackedGraph: false,
  stackedGraphNaNFill: 'all',
  hideOverlayOnMouseOut: true,
  resizable: 'no',

  legend: 'onmouseover',
  legendFollowOffsetX: 50,
  legendFollowOffsetY: -50,
  stepPlot: false,
  xRangePad: 0,
  yRangePad: null,
  drawAxesAtZero: false,

  // Sizes of the various chart labels.
  titleHeight: 28,
  xLabelHeight: 18,
  yLabelWidth: 18,

  axisLineColor: 'black',
  axisLineWidth: 0.3,
  gridLineWidth: 0.3,
  axisLabelWidth: 50,
  gridLineColor: 'rgb(128,128,128)',

  interactionModel: ZgraphInteraction.defaultModel,
  animatedZooms: false, // (for now)
  animateBackgroundFade: true,

  // Range selector options
  showRangeSelector: false,
  rangeSelectorHeight: 40,
  rangeSelectorPlotStrokeColor: '#808FAB',
  rangeSelectorPlotFillGradientColor: 'white',
  rangeSelectorPlotFillColor: '#A7B1C4',
  rangeSelectorBackgroundStrokeColor: 'gray',
  rangeSelectorBackgroundLineWidth: 1,
  rangeSelectorPlotLineWidth: 1.5,
  rangeSelectorForegroundStrokeColor: 'black',
  rangeSelectorForegroundLineWidth: 1,
  rangeSelectorAlpha: 0.6,
  showInRangeSelector: null,

  // The ordering here ensures that central lines always appear above any
  // fill bars/error bars.
  plotter: [
    ZgraphCanvasRenderer._fillPlotter,
    ZgraphCanvasRenderer._errorPlotter,
    ZgraphCanvasRenderer._linePlotter,
  ],

  plugins: [],

  // per-axis options
  axes: {
    x: {
      pixelsPerLabel: 70,
      axisLabelWidth: 60,
      axisLabelFormatter: utils.dateAxisLabelFormatter,
      valueFormatter: utils.dateValueFormatter,
      drawGrid: true,
      drawAxis: true,
      independentTicks: true,
      ticker: ZgraphTickers.dateTicker,
    },
    y: {
      axisLabelWidth: 50,
      pixelsPerLabel: 30,
      valueFormatter: utils.numberValueFormatter,
      axisLabelFormatter: utils.numberAxisLabelFormatter,
      drawGrid: true,
      drawAxis: true,
      independentTicks: true,
      ticker: ZgraphTickers.numericTicks,
    },
    y2: {
      axisLabelWidth: 50,
      pixelsPerLabel: 30,
      valueFormatter: utils.numberValueFormatter,
      axisLabelFormatter: utils.numberAxisLabelFormatter,
      drawAxis: true, // only applies when there are two axes of data.
      drawGrid: false,
      independentTicks: false,
      ticker: ZgraphTickers.numericTicks,
    },
  },
};

export default DEFAULT_ATTRS;

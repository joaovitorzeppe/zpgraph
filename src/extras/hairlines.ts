/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZgraphImport from 'zpgraph';
import { log } from '../logger';
import type { ZgraphInstance } from '../internal-types';
import type { Point } from '../types';
import { div, drag, makeEmitter, setStyle, toggle } from './dom-helpers';
import type { Emitter } from './dom-helpers';

interface PublicHairline {
  xval: number;
  interpolated: boolean;
  selected: boolean;
}

interface Hairline extends PublicHairline {
  lineDiv: HTMLElement;
  infoDiv: HTMLElement;
  domX?: number;
  stopDrag?: () => void;
}

interface HairlineSelPoint extends Point {
  prevRow?: number | null;
  nextRow?: number | null;
}

interface HairlineDivFillerData {
  closestRow: number | undefined;
  points: HairlineSelPoint[];
  hairline: PublicHairline;
  zgraph: ZgraphInstance;
}

interface HairlinesOptions {
  divFiller?: (div: HTMLElement, data: HairlineDivFillerData) => void;
}

interface ChartClickEvent {
  canvasx: number;
}

type LegendPluginStatic = {
  generateLegendHTML: (
    g: ZgraphInstance,
    x: number,
    sel_points: Point[],
    oneEmWidth: number,
    row?: number,
  ) => string | Node;
};

type ZgraphExtrasHost = typeof ZgraphImport & {
  Plugins: Record<string, unknown> & { Legend?: LegendPluginStatic };
};

const Zgraph = ZgraphImport as ZgraphExtrasHost;
Zgraph.Plugins = Zgraph.Plugins || {};

const chartValue = (g: ZgraphInstance, row: number, col: number): number =>
  Number(g.getValue(row, col));

Zgraph.Plugins.Hairlines = (function _extras_hairlines_closure() {
  'use strict';

  /**
   * @typedef {
   *   xval:  number,      // x-value (i.e. millis or a raw number)
   *   interpolated: bool,  // alternative is to snap to closest
   *   lineDiv: !Element    // vertical hairline div
   *   infoDiv: !Element    // div containing info about the nearest points
   *   selected: boolean    // whether this hairline is selected
   * } Hairline
   */

  // We have to wait a few ms after clicks to give the user a chance to
  // double-click to unzoom. This sets that delay period.
  let CLICK_DELAY_MS = 300;

  /**
   * Notifies of `hairlineCreated`, `hairlineDeleted`, `hairlineMoved` and
   * `hairlinesChanged` through addEventListener; the payload of each is on
   * `event.detail`.
   */
  class hairlines implements Emitter {
    /** @private {!Array.<!Hairline>} */
    hairlines_: Hairline[] = [];

    /** Used to detect resizes, which require the divs to be repositioned. */
    lastWidth_ = -1;
    lastHeight = -1;

    zgraph_: ZgraphInstance | null = null;
    addTimer_: ReturnType<typeof setTimeout> | null = null;
    divFiller_:
      ((div: HTMLElement, data: HairlineDivFillerData) => void) | null = null;

    // Installed by makeEmitter in the constructor.
    addEventListener!: Emitter['addEventListener'];
    removeEventListener!: Emitter['removeEventListener'];
    emit_!: Emitter['emit_'];

    constructor(opt_options?: HairlinesOptions) {
      opt_options = opt_options || {};
      this.divFiller_ = opt_options.divFiller || null;

      makeEmitter(this);
    }

    toString() {
      return 'Hairlines Plugin';
    }

    activate(g: ZgraphInstance) {
      this.zgraph_ = g;
      this.hairlines_ = [];

      return {
        didDrawChart: this.didDrawChart,
        click: this.click,
        dblclick: this.dblclick,
        dataDidUpdate: this.dataDidUpdate,
      };
    }

    detachLabels() {
      for (const h of this.hairlines_) {
        teardownHairline(h);
      }
      this.hairlines_ = [];
    }

    g_(): ZgraphInstance {
      return this.zgraph_!;
    }

    hairlineWasDragged(h: Hairline, left: number) {
      let oldXVal = h.xval;
      h.xval = this.zgraph_!.toDataXCoord(left)!;
      this.moveHairlineToTop(h);
      this.updateHairlineDivPositions();
      this.updateHairlineInfo();
      this.updateHairlineStyles();
      this.emit_('hairlineMoved', {
        oldXVal: oldXVal,
        newXVal: h.xval,
      });
      this.emit_('hairlinesChanged', {});
    }

    createHairline(props: Partial<Hairline> & Pick<Hairline, 'xval'>) {
      let h: Hairline;

      const lineContainerDiv = div('zgraph-hairline', {
        width: '6px',
        'margin-left': '-3px',
        position: 'absolute',
        'z-index': '10',
      });

      const lineDiv = div(undefined, {
        width: '1px',
        position: 'relative',
        left: '3px',
        background: 'black',
        height: '100%',
      });
      lineContainerDiv.appendChild(lineDiv);

      const infoDiv = makeInfoDiv();

      h = Object.assign(
        {
          interpolated: true,
          selected: false,
          lineDiv: lineContainerDiv,
          infoDiv: infoDiv,
        },
        props,
      ) as Hairline;

      // Both divs drag the same hairline, each along x only, staying inside the
      // plot area. The chart's own coordinates are the ones that matter here: the
      // divs are positioned by toDomXCoord, not by where the page happens to sit.
      const bounds = () => {
        const area = this.g_().getArea();
        return { min: area.x, max: area.x + area.w };
      };
      const onMove = (left: number) => this.hairlineWasDragged(h, left);
      const stopLine = drag(lineContainerDiv, { axis: 'x', bounds, onMove });
      const stopInfo = drag(infoDiv, { axis: 'x', bounds, onMove });
      h.stopDrag = () => {
        stopLine();
        stopInfo();
      };

      infoDiv.addEventListener('click', (e: MouseEvent) => {
        if ((e.target as Element)?.closest?.('.hairline-kill-button')) {
          this.removeHairline(h);
          this.emit_('hairlineDeleted', { xval: h.xval });
          this.emit_('hairlinesChanged', {});
          e.stopPropagation(); // don't want the click below to trigger.
          return;
        }
        this.moveHairlineToTop(h);
      });

      return h;
    }

    moveHairlineToTop(h: Hairline) {
      let graphDiv = this.g_().graphDiv;
      graphDiv.appendChild(h.infoDiv);
      graphDiv.appendChild(h.lineDiv);

      let idx = this.hairlines_.indexOf(h);
      this.hairlines_.splice(idx, 1);
      this.hairlines_.push(h);
    }

    updateHairlineDivPositions() {
      let g = this.g_();
      let layout = g.getArea();
      let chartLeft = layout.x,
        chartRight = layout.x + layout.w;

      for (const h of this.hairlines_) {
        let left = g.toDomXCoord(h.xval) ?? 0;
        h.domX = left; // See comments in this.dataDidUpdate
        setStyle(h.lineDiv, {
          left: left + 'px',
          top: layout.y + 'px',
          height: layout.h + 'px',
        });
        setStyle(h.infoDiv, {
          left: left + 'px',
          top: layout.y + 'px',
        });

        let visible = left >= chartLeft && left <= chartRight;
        toggle(h.infoDiv, visible);
        toggle(h.lineDiv, visible);
      }
    }

    updateHairlineStyles() {
      for (const h of this.hairlines_) {
        h.infoDiv.classList.toggle('selected', !!h.selected);
        h.lineDiv.classList.toggle('selected', !!h.selected);
      }
    }

    static findPrevNextRows(
      g: ZgraphInstance,
      xval: number,
      col: number,
    ): [number | null, number | null] {
      let prevRow: number | null = null;
      let nextRow: number | null = null;
      let numRows = g.numRows();
      for (let row = 0; row < numRows; row++) {
        let yval = g.getValue(row, col);
        if (yval === null || yval === undefined || isNaN(Number(yval)))
          continue;

        let rowXval = Number(g.getValue(row, 0));
        if (rowXval <= xval) prevRow = row;

        if (rowXval >= xval) {
          nextRow = row;
          break;
        }
      }

      return [prevRow, nextRow];
    }

    updateHairlineInfo() {
      let g = this.g_();

      for (const h of this.hairlines_) {
        // To use generateLegendHTML, we synthesize an array of selected points.
        const selPoints: HairlineSelPoint[] = [];
        let labels = g.getLabels()!;
        let row: number | undefined;
        let prevRow: number | null;
        let nextRow: number | null;

        if (!h.interpolated) {
          // "closest point" mode.
          row = g.findClosestRow(g.toDomXCoord(h.xval) ?? 0);
          for (let i = 1; i < g.numColumns(); i++) {
            const label = labels[i];
            if (!label) continue;
            selPoints.push({
              canvasx: 1,
              canvasy: 1,
              xval: h.xval,
              yval: chartValue(g, row, i),
              name: label,
              idx: row,
            });
          }
        } else {
          // "interpolated" mode.
          for (let i = 1; i < g.numColumns(); i++) {
            const label = labels[i];
            if (!label) continue;

            let prevNextRow = hairlines.findPrevNextRows(g, h.xval, i);
            prevRow = prevNextRow[0];
            nextRow = prevNextRow[1];

            // For x-values outside the domain, interpolate "between" the extreme
            // point and itself.
            if (prevRow === null) prevRow = nextRow;
            if (nextRow === null) nextRow = prevRow;
            if (prevRow === null || nextRow === null) continue;

            // linear interpolation
            let prevX = chartValue(g, prevRow, 0);
            let nextX = chartValue(g, nextRow, 0);
            let prevY = chartValue(g, prevRow, i);
            let nextY = chartValue(g, nextRow, i);
            let frac =
              prevRow === nextRow ? 0 : (h.xval - prevX) / (nextX - prevX);
            let yval = frac * nextY + (1 - frac) * prevY;

            selPoints.push({
              canvasx: 1,
              canvasy: 1,
              xval: h.xval,
              yval: yval,
              prevRow: prevRow,
              nextRow: nextRow,
              name: label,
              idx: prevRow,
            });
          }
        }

        if (this.divFiller_) {
          this.divFiller_(h.infoDiv, {
            closestRow: row,
            points: selPoints,
            hairline: this.createPublicHairline_(h),
            zgraph: g,
          });
        } else {
          let target = h.infoDiv.querySelector('.hairline-legend');
          if (target) {
            let content = Zgraph.Plugins.Legend!.generateLegendHTML(
              g,
              h.xval,
              selPoints,
              10,
            );
            if (content instanceof Node) {
              target.replaceChildren(content);
            } else {
              // Trusted app HTML — see README "Content Security Policy".
              target.innerHTML = content;
            }
          }
        }
      }
    }

    attachHairlinesToChart_() {
      let graphDiv = this.g_().graphDiv;
      for (const h of this.hairlines_) {
        graphDiv.appendChild(h.lineDiv);
        graphDiv.appendChild(h.infoDiv);
      }
    }

    removeHairline(h: Hairline) {
      let idx = this.hairlines_.indexOf(h);
      if (idx >= 0) {
        this.hairlines_.splice(idx, 1);
        teardownHairline(h);
      } else {
        log.warn('Tried to remove non-existent hairline.');
      }
    }

    didDrawChart(_e: unknown) {
      // Early out in the (common) case of zero hairlines.
      if (this.hairlines_.length === 0) return;

      this.updateHairlineDivPositions();
      this.attachHairlinesToChart_();
      this.updateHairlineInfo();
      this.updateHairlineStyles();
    }

    dataDidUpdate(_e: unknown) {
      // When the data in the chart updates, the hairlines should stay in the same
      // position on the screen. didDrawChart stores a domX parameter for each
      // hairline. We use that to reposition them on data updates.
      let g = this.g_();
      for (const h of this.hairlines_) {
        if (h.domX !== undefined) {
          h.xval = g.toDataXCoord(h.domX)!;
        }
      }
    }

    click(e: ChartClickEvent) {
      if (this.addTimer_) {
        // Another click is in progress; ignore this one.
        return;
      }

      let xval = this.zgraph_!.toDataXCoord(e.canvasx)!;

      this.addTimer_ = setTimeout(() => {
        this.addTimer_ = null;
        this.hairlines_.push(this.createHairline({ xval: xval }));

        this.updateHairlineDivPositions();
        this.updateHairlineInfo();
        this.updateHairlineStyles();
        this.attachHairlinesToChart_();

        this.emit_('hairlineCreated', { xval: xval });
        this.emit_('hairlinesChanged', {});
      }, CLICK_DELAY_MS);
    }

    dblclick(_e: unknown) {
      if (this.addTimer_) {
        clearTimeout(this.addTimer_);
        this.addTimer_ = null;
      }
    }

    destroy() {
      this.detachLabels();
    }

    createPublicHairline_(h: Hairline): PublicHairline {
      return {
        xval: h.xval,
        interpolated: h.interpolated,
        selected: h.selected,
      };
    }

    get(): PublicHairline[] {
      const result: PublicHairline[] = [];
      for (const h of this.hairlines_) {
        result.push(this.createPublicHairline_(h));
      }
      return result;
    }

    set(hairlines: PublicHairline[]) {
      // Re-use divs from the old hairlines array so far as we can.
      // They're already correctly z-ordered.
      let anyCreated = false;
      for (let i = 0; i < hairlines.length; i++) {
        let h = hairlines[i]!;

        if (this.hairlines_.length > i) {
          const existing = this.hairlines_[i]!;
          existing.xval = h.xval;
          existing.interpolated = h.interpolated;
          existing.selected = h.selected;
        } else {
          this.hairlines_.push(
            this.createHairline({
              xval: h.xval,
              interpolated: h.interpolated,
              selected: h.selected,
            }),
          );
          anyCreated = true;
        }
      }

      // If there are any remaining hairlines, destroy them.
      while (hairlines.length < this.hairlines_.length) {
        this.removeHairline(this.hairlines_[hairlines.length]!);
      }

      this.updateHairlineDivPositions();
      this.updateHairlineInfo();
      this.updateHairlineStyles();
      if (anyCreated) {
        this.attachHairlinesToChart_();
      }

      this.emit_('hairlinesChanged', {});
    }
  }

  /** @private Detach one hairline's divs and its drag listeners. */
  const teardownHairline = function (h: Hairline) {
    if (h.stopDrag) h.stopDrag();
    h.lineDiv.remove();
    h.infoDiv.remove();
  };

  /**
   * The info div is a clone of the page's #hairline-template. A page that has no
   * such template gets an empty one instead of a crash.
   * @private
   */
  const makeInfoDiv = function () {
    let template = document.getElementById('hairline-template');
    let infoDiv: HTMLElement;
    if (template) {
      infoDiv = template.cloneNode(true) as HTMLElement;
      infoDiv.removeAttribute('id');
    } else {
      infoDiv = div();
      infoDiv.appendChild(div('hairline-legend'));
    }
    setStyle(infoDiv, { position: 'absolute', display: 'block' });
    return infoDiv;
  };

  // This creates the hairline object and returns it.
  // It does not position it and does not attach it to the chart.

  // Moves a hairline's divs to the top of the z-ordering.

  // Positions existing hairline divs.

  // Sets styles on the hairline (i.e. "selected")

  // Find prevRow and nextRow such that
  // g.getValue(prevRow, 0) <= xval
  // g.getValue(nextRow, 0) >= xval
  // g.getValue({prev,next}Row, col) != null, NaN or undefined
  // and there's no other row such that:
  //   g.getValue(prevRow, 0) < g.getValue(row, 0) < g.getValue(nextRow, 0)
  //   g.getValue(row, col) != null, NaN or undefined.
  // Returns [prevRow, nextRow]. Either can be null (but not both).

  // Fills out the info div based on current coordinates.

  // After a resize, the hairline divs can get dettached from the chart.
  // This reattaches them.

  // Deletes a hairline and removes it from the chart.

  // Public API

  /**
   * This is a restricted view of this.hairlines_ which doesn't expose
   * implementation details like the handle divs.
   *
   * @typedef {
   *   xval:  number,       // x-value (i.e. millis or a raw number)
   *   interpolated: bool,  // alternative is to snap to closest
   *   selected: bool       // whether the hairline is selected.
   * } PublicHairline
   */

  /**
   * @param h Internal hairline.
   * @return Restricted public view of the hairline.
   */

  /**
   * @return The current set of hairlines, ordered
   *     from back to front.
   */

  /**
   * Calling this will result in a hairlinesChanged event being triggered, no
   * matter whether it consists of additions, deletions, moves or no changes at
   * all.
   *
   * @param hairlines The new set of hairlines,
   *     ordered from back to front.
   */

  return hairlines;
})();

export default Zgraph.Plugins.Hairlines;

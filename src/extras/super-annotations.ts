/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZgraphImport from 'zpgraph';
import { log } from '../logger';
import type { OptionsGetter, ZgraphInstance } from '../internal-types';
import type { Point } from '../types';
import {
  div,
  drag,
  fillTemplate,
  makeEmitter,
  setStyle,
  toggle,
} from './dom-helpers';
import type { Emitter } from './dom-helpers';

interface PublicAnnotation {
  series: string;
  xval: number;
  yFrac?: number;
  text?: string;
  x?: unknown;
  y?: unknown;
  [key: string]: unknown;
}

interface InternalAnnotation extends PublicAnnotation {
  lineDiv?: HTMLElement;
  infoDiv?: HTMLElement;
  stopDrag?: () => void;
  isDragging?: boolean;
  editable?: boolean;
}

interface SuperAnnotationsOptions {
  defaultAnnotationProperties?: Record<string, unknown>;
}

interface PointClickEvent {
  point: Point;
  preventDefault(): void;
}

type ZgraphChart = ZgraphInstance & {
  optionsViewForAxis_(axis: string): OptionsGetter;
};

type ZgraphExtrasHost = typeof ZgraphImport & {
  Plugins: Record<string, unknown>;
};

const Zgraph = ZgraphImport as ZgraphExtrasHost;
Zgraph.Plugins = Zgraph.Plugins || {};

Zgraph.Plugins.SuperAnnotations = (function _extras_superAnnotations_closure() {
  'use strict';

  /**
   * These are just the basic requirements -- annotations can have whatever other
   * properties the code that displays them wants them to have.
   *
   * @typedef {
   *   xval:  number,      // x-value (i.e. millis or a raw number)
   *   series: string,     // series name
   *   yFrac: ?number,     // y-positioning. Default is a few px above the point.
   *   lineDiv: !Element   // vertical div connecting point to info div.
   *   infoDiv: !Element   // div containing info about the annotation.
   * } Annotation
   */

  /**
   * Notifies of `annotationCreated`, `annotationDeleted`, `annotationMoved`,
   * `annotationEdited`, `beganEditAnnotation`, `cancelEditAnnotation` and
   * `annotationsChanged` through addEventListener; the payload of each is on
   * `event.detail`.
   */
  class annotations implements Emitter {
    annotations_: InternalAnnotation[] = [];

    /** Used to detect resizes, which require the divs to be repositioned. */
    lastWidth_ = -1;
    lastHeight = -1;

    zgraph_: ZgraphChart | null = null;
    defaultAnnotationProperties_: Record<string, unknown> = {};

    // Installed by makeEmitter in the constructor.
    addEventListener!: Emitter['addEventListener'];
    removeEventListener!: Emitter['removeEventListener'];
    emit_!: Emitter['emit_'];

    constructor(opt_options?: SuperAnnotationsOptions) {
      opt_options = opt_options || {};
      this.defaultAnnotationProperties_ = Object.assign(
        {
          text: 'Description',
        },
        opt_options.defaultAnnotationProperties,
      );

      makeEmitter(this);
    }

    toString() {
      return 'SuperAnnotations Plugin';
    }

    activate(g: ZgraphChart) {
      this.zgraph_ = g;
      this.annotations_ = [];

      return {
        didDrawChart: this.didDrawChart,
        pointClick: this.pointClick,
      };
    }

    detachLabels() {
      for (const a of this.annotations_) {
        teardownAnnotation(a);
      }
      this.annotations_ = [];
    }

    g_(): ZgraphChart {
      return this.zgraph_!;
    }

    annotationWasDragged(a: InternalAnnotation, top: number) {
      let g = this.g_();
      let area = g.getArea();
      let oldYFrac = a.yFrac;

      let infoDiv = a.infoDiv!;
      infoDiv.style.top = top + 'px';
      let newYFrac =
        (infoDiv.offsetTop + infoDiv.offsetHeight - area.y) / area.h;
      if (newYFrac === oldYFrac) return;

      a.yFrac = newYFrac;

      this.moveAnnotationToTop(a);
      this.updateAnnotationDivPositions();
      this.updateAnnotationInfo();
      this.emit_('annotationMoved', {
        annotation: a,
        oldYFrac: oldYFrac,
        newYFrac: a.yFrac,
      });
      this.emit_('annotationsChanged', {});
    }

    makeAnnotationEditable(a: InternalAnnotation) {
      if (a.editable === true) return;
      this.moveAnnotationToTop(a);

      // Note: we have to fill out the div ourselves because
      // updateAnnotationInfo() won't touch editable annotations.
      a.editable = true;
      this.fillInfoDiv_(
        document.getElementById('annotation-editable-template'),
        a,
      );
      a.infoDiv!.classList.toggle('editable', !!a.editable);
      this.emit_('beganEditAnnotation', a);
    }

    createAnnotation(
      a: PublicAnnotation & Partial<InternalAnnotation>,
    ): InternalAnnotation {
      let ann = a as InternalAnnotation;
      let color = this.getColorForSeries_(ann.series) ?? '#000';

      const lineDiv = div('zgraph-annotation-line', {
        width: '1px',
        left: '3px',
        background: 'black',
        height: '100%',
        position: 'absolute',
        'background-color': color,
        'z-index': '10',
      });

      let template = document.getElementById('annotation-template');
      let infoDiv: HTMLElement;
      if (template) {
        infoDiv = template.cloneNode(true) as HTMLElement;
        infoDiv.removeAttribute('id');
      } else {
        // A page with no template gets an empty div rather than a crash.
        infoDiv = div();
      }
      setStyle(infoDiv, {
        position: 'absolute',
        'border-color': color,
        'z-index': '10',
        display: 'block',
      });

      Object.assign(ann, {
        lineDiv: lineDiv,
        infoDiv: infoDiv,
      });

      ann.stopDrag = drag(infoDiv, {
        axis: 'y',
        // 'parent' containment: the annotation stays inside the chart div.
        bounds: () => ({
          min: 0,
          max: Math.max(
            0,
            this.g_().graphDiv.offsetHeight - infoDiv.offsetHeight,
          ),
        }),
        onStart: () => {
          // Dragging drives `top`, while the resting position is set with
          // `bottom`. Both at once makes the annotation stretch as it moves.
          infoDiv.style.bottom = '';
          ann.isDragging = true;
        },
        onMove: (top: number) => this.annotationWasDragged(ann, top),
        onEnd: () => {
          infoDiv.style.top = '';
          ann.isDragging = false;
          this.updateAnnotationDivPositions();
        },
      });

      infoDiv.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as Element;
        if (target?.closest?.('.annotation-kill-button')) {
          this.removeAnnotation(ann);
          this.emit_('annotationDeleted', ann);
          this.emit_('annotationsChanged', {});
        } else if (target?.closest?.('.annotation-update')) {
          this.extractUpdatedProperties_(infoDiv, ann);
          ann.editable = false;
          this.updateAnnotationInfo();
          this.emit_('annotationEdited', ann);
          this.emit_('annotationsChanged', {});
        } else if (target?.closest?.('.annotation-cancel')) {
          ann.editable = false;
          this.updateAnnotationInfo();
          this.emit_('cancelEditAnnotation', ann);
        }
      });

      infoDiv.addEventListener('dblclick', () => {
        this.makeAnnotationEditable(ann);
      });

      return ann;
    }

    findPointIndex_(series: string, xval: number): [number, number] | null {
      let col = this.g_().getLabels()!.indexOf(series);
      if (col === -1) return null;

      let lowIdx = 0;
      let highIdx = this.g_().numRows() - 1;
      while (lowIdx <= highIdx) {
        let idx = Math.floor((lowIdx + highIdx) / 2);
        let xAtIdx = Number(this.g_().getValue(idx, 0));
        if (xAtIdx === xval) {
          return [idx, col];
        } else if (xAtIdx < xval) {
          lowIdx = idx + 1;
        } else {
          highIdx = idx - 1;
        }
      }
      return null;
    }

    getColorForSeries_(series: string): string | null {
      let colors = this.g_().getColors();
      let col = this.g_().getLabels()!.indexOf(series);
      if (col === -1) return null;

      return colors[(col - 1) % colors.length] ?? null;
    }

    moveAnnotationToTop(a: InternalAnnotation) {
      let graphDiv = this.g_().graphDiv;
      graphDiv.appendChild(a.infoDiv!);
      graphDiv.appendChild(a.lineDiv!);

      let idx = this.annotations_.indexOf(a);
      this.annotations_.splice(idx, 1);
      this.annotations_.push(a);
    }

    updateAnnotationDivPositions() {
      let layout = this.g_().getArea();
      let chartLeft = layout.x;
      let chartRight = layout.x + layout.w;
      let chartTop = layout.y;
      let chartBottom = layout.y + layout.h;
      let graphDiv = this.g_().graphDiv;

      let g = this.g_();

      for (const a of this.annotations_) {
        let row_col = this.findPointIndex_(a.series, a.xval);
        if (row_col == null) {
          toggle(a.lineDiv!, false);
          toggle(a.infoDiv!, false);
          continue;
        }
        toggle(a.lineDiv!, true);
        toggle(a.infoDiv!, true);

        let xy = g.toDomCoords(
          a.xval,
          Number(g.getValue(row_col[0], row_col[1])),
        );
        let x = xy[0],
          pointY = xy[1];

        let lineHeight = 6;

        let y = pointY;
        if (a.yFrac !== undefined) {
          y = layout.y + layout.h * a.yFrac;
        } else {
          y -= lineHeight;
        }

        lineHeight =
          y < pointY ? pointY - y : y - pointY - a.infoDiv!.offsetHeight;
        setStyle(a.lineDiv!, {
          left: x + 'px',
          top: Math.min(y, pointY) + 'px',
          height: lineHeight + 'px',
        });
        a.infoDiv!.style.left = x + 'px';

        if (!a.isDragging) {
          a.infoDiv!.style.bottom = graphDiv.offsetHeight - y + 'px';

          let visible =
            x >= chartLeft &&
            x <= chartRight &&
            pointY >= chartTop &&
            pointY <= chartBottom;
          toggle(a.infoDiv!, visible);
          toggle(a.lineDiv!, visible);
        }
      }
    }

    updateAnnotationInfo() {
      let templateDiv = document.getElementById('annotation-template');
      for (const a of this.annotations_) {
        // We should never update an editable div -- doing so may kill unsaved
        // edits to an annotation.
        a.infoDiv!.classList.toggle('editable', !!a.editable);
        if (a.editable) continue;
        this.fillInfoDiv_(templateDiv, a);
      }
    }

    createPublicAnnotation_(
      a: InternalAnnotation,
      opt_props?: Record<string, unknown>,
    ): PublicAnnotation {
      const merged = Object.assign({}, a, opt_props) as InternalAnnotation;
      const {
        infoDiv: _infoDiv,
        lineDiv: _lineDiv,
        stopDrag: _stopDrag,
        isDragging: _isDragging,
        editable: _editable,
        ...rest
      } = merged;
      return rest as PublicAnnotation;
    }

    fillInfoDiv_(template: HTMLElement | null, a: InternalAnnotation) {
      if (!template) return;
      let g = this.g_();
      let row_col = this.findPointIndex_(a.series, a.xval);
      if (row_col == null) return; // perhaps it's no longer a real point?
      let row = row_col[0];
      let col = row_col[1];

      let yOptView = g.optionsViewForAxis_('y1');
      let xOptView = g.optionsViewForAxis_('x');
      let xvf = g.getOptionForAxis('valueFormatter', 'x');

      let x = (xvf as (...args: unknown[]) => unknown).call(
        g,
        a.xval,
        xOptView,
      );
      let y = (
        g.getOption('valueFormatter', a.series) as (
          ...args: unknown[]
        ) => unknown
      ).call(g, g.getValue(row, col), yOptView);

      let values = this.createPublicAnnotation_(a, { x: x, y: y });
      for (const key of Object.keys(values)) {
        // e.g. a nested object a caller hung off the annotation.
        if (typeof values[key] === 'object') delete values[key];
      }

      a.infoDiv!.replaceChildren(...fillTemplate(template, values).childNodes);
    }

    extractUpdatedProperties_(div: HTMLElement, a: InternalAnnotation) {
      for (const el of div.querySelectorAll('[dg-ann-field]')) {
        let k = el.getAttribute('dg-ann-field');
        if (k) a[k] = (el as HTMLInputElement).value;
      }
    }

    attachAnnotationsToChart_() {
      let graphDiv = this.g_().graphDiv;
      for (const a of this.annotations_) {
        // Re-attaching an editable div to the DOM can clear its focus.
        // This makes typing really difficult!
        if (a.editable) continue;

        graphDiv.appendChild(a.lineDiv!);
        graphDiv.appendChild(a.infoDiv!);
      }
    }

    removeAnnotation(a: InternalAnnotation) {
      let idx = this.annotations_.indexOf(a);
      if (idx >= 0) {
        this.annotations_.splice(idx, 1);
        teardownAnnotation(a);
      } else {
        log.warn('Tried to remove non-existent annotation.');
      }
    }

    didDrawChart(_e: unknown) {
      // Early out in the (common) case of zero annotations.
      if (this.annotations_.length === 0) return;

      this.updateAnnotationDivPositions();
      this.attachAnnotationsToChart_();
      this.updateAnnotationInfo();
    }

    pointClick(e: PointClickEvent) {
      // Prevent any other behavior based on this click, e.g. creation of a hairline.
      e.preventDefault();

      let a = this.createAnnotation(
        Object.assign({}, this.defaultAnnotationProperties_, {
          series: e.point.name,
          xval: e.point.xval!,
        }),
      );
      this.annotations_.push(a);

      this.updateAnnotationDivPositions();
      this.updateAnnotationInfo();
      this.attachAnnotationsToChart_();

      this.emit_('annotationCreated', a);
      this.emit_('annotationsChanged', {});

      // Annotations should begin life editable.
      this.makeAnnotationEditable(a);
    }

    destroy() {
      this.detachLabels();
    }

    get(): PublicAnnotation[] {
      const result: PublicAnnotation[] = [];
      for (const ann of this.annotations_) {
        result.push(this.createPublicAnnotation_(ann));
      }
      return result;
    }

    set(annotations: PublicAnnotation[]) {
      // Re-use divs from the old annotations array so far as we can.
      // They're already correctly z-ordered.
      let anyCreated = false;
      for (let i = 0; i < annotations.length; i++) {
        let a = annotations[i]!;

        if (this.annotations_.length > i) {
          // Only the divs and their listeners need to be preserved.
          let oldA = this.annotations_[i]!;
          this.annotations_[i] = Object.assign(
            {
              infoDiv: oldA.infoDiv,
              lineDiv: oldA.lineDiv,
              stopDrag: oldA.stopDrag,
            },
            a,
          ) as InternalAnnotation;
        } else {
          this.annotations_.push(this.createAnnotation(a));
          anyCreated = true;
        }
      }

      // If there are any remaining annotations, destroy them.
      while (annotations.length < this.annotations_.length) {
        this.removeAnnotation(this.annotations_[annotations.length]!);
      }

      this.updateAnnotationDivPositions();
      this.updateAnnotationInfo();
      if (anyCreated) {
        this.attachAnnotationsToChart_();
      }

      this.emit_('annotationsChanged', {});
    }
  }

  /** @private Detach one annotation's divs and its drag listeners. */
  const teardownAnnotation = function (a: InternalAnnotation) {
    if (a.stopDrag) a.stopDrag();
    a.lineDiv?.remove();
    a.infoDiv?.remove();
  };

  // This creates the annotation object and returns it.
  // It does not position it and does not attach it to the chart.

  // Find the index of a point in a series.
  // Returns a 2-element array, [row, col], which can be used with
  // zgraph.getValue() to get the value at this point.
  // Returns null if there's no match.

  // Moves an annotation's divs to the top of the z-ordering.

  // Positions existing annotation divs.

  // Fills out the info div based on current coordinates.

  /**
   * @param a Internal annotation
   * @return a view of the annotation for the public API.
   */

  /**
   * Refill an annotation's info div from a `{{key}}` template.
   *
   * The values are written into text nodes and field values, so an annotation
   * carrying markup — it usually comes from wherever the chart's data does —
   * is shown rather than run.
   * @private
   */

  // Update the annotation object by looking for elements with a 'dg-ann-field'
  // attribute. For example, <input type='text' dg-ann-field='text' /> will have
  // its value placed in the 'text' attribute of the annotation.

  // After a resize, the annotation divs can get dettached from the chart.
  // This reattaches them.

  // Deletes an annotation and removes it from the chart.

  // Public API

  /**
   * This is a restricted view of this.annotations_ which doesn't expose
   * implementation details like the line / info divs.
   *
   * @typedef {
   *   xval:  number,      // x-value (i.e. millis or a raw number)
   *   series: string,     // series name
   * } PublicAnnotation
   */

  /**
   * @return The current set of annotations, ordered
   *     from back to front.
   */

  /**
   * Calling this will result in an annotationsChanged event being triggered, no
   * matter whether it consists of additions, deletions, moves or no changes at
   * all.
   *
   * @param annotations The new set of annotations,
   *     ordered from back to front.
   */

  return annotations;
})();

export default Zgraph.Plugins.SuperAnnotations;

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

import ZgraphImport from 'zpgraph';
import type { ChartDrawPluginEvent } from '../internal-types';
import type ZgraphClass from '../zgraph';

type ZgraphExtrasHost = typeof ZgraphImport & {
  Plugins: Record<string, unknown> & { Unzoom?: typeof Unzoom };
};

const Zgraph = ZgraphImport as ZgraphExtrasHost;
Zgraph.Plugins = Zgraph.Plugins || {};

/**
 * @fileoverview Plug-in for providing unzoom-on-hover.
 */
class Unzoom {
  button_: HTMLButtonElement | null = null;

  // True when the mouse is over the canvas. Must be tracked
  // because the unzoom button state can change even when the
  // mouse-over state hasn't.
  over_ = false;

  toString() {
    return 'Unzoom Plugin';
  }

  activate(_g: ZgraphClass) {
    return {
      willDrawChart: this.willDrawChart,
    };
  }

  willDrawChart(e: ChartDrawPluginEvent) {
    let g = e.zgraph;

    if (this.button_ !== null) {
      // short-circuit: show the button only when we're moused over, and zoomed in.
      let showButton = g.isZoomed() && this.over_;
      this.show(showButton);
      return;
    }

    const button = document.createElement('button');
    this.button_ = button;
    button.textContent = 'Reset Zoom';
    button.style.display = 'none';
    button.style.position = 'absolute';
    let area = g.plotter_.area;
    button.style.top = area.y + 4 + 'px';
    button.style.left = area.x + 4 + 'px';
    button.style.zIndex = '11';
    let parent = g.graphDiv;
    parent.insertBefore(button, parent.firstChild);

    button.onclick = () => {
      g.resetZoom();
    };

    g.addAndTrackEvent(parent, 'mouseover', () => {
      if (g.isZoomed()) {
        this.show(true);
      }
      this.over_ = true;
    });

    g.addAndTrackEvent(parent, 'mouseout', () => {
      this.show(false);
      this.over_ = false;
    });
  }

  show(enabled: boolean) {
    this.button_!.style.display = enabled ? '' : 'none';
  }

  destroy() {
    const button = this.button_;
    if (button?.parentElement) button.parentElement.removeChild(button);
  }
}

Zgraph.Plugins.Unzoom = Unzoom;

export default Unzoom;

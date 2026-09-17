'use strict';

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * To create a "drag" interaction, you typically register a mousedown event
 * handler on the element where the drag begins. In that handler, you register a
 * mouseup handler on the window to determine when the mouse is released,
 * wherever that release happens. This works well, except when the user releases
 * the mouse over an off-domain iframe. In that case, the mouseup event is
 * handled by the iframe and never bubbles up to the window handler.
 *
 * To deal with this issue, we cover iframes with high z-index divs to make sure
 * they don't capture mouseup.
 *
 * Usage:
 * element.addEventListener('mousedown', ()  => {
 *   const tarper = new IFrameTarp();
 *   tarper.cover();
 *   const mouseUpHandler = ()  => {
 *     ...
 *     window.removeEventListener(mouseUpHandler);
 *     tarper.uncover();
 *   };
 *   window.addEventListener('mouseup', mouseUpHandler);
 * });
 */
import * as utils from './utils';

export default class IFrameTarp {
  tarps: HTMLDivElement[] = [];

  /** Cover all document iframes with high z-index transparent divs. */
  cover() {
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
      const iframe = iframes[i]!;
      const pos = utils.findPos(iframe);
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = pos.x + 'px';
      div.style.top = pos.y + 'px';
      div.style.width = iframe.offsetWidth + 'px';
      div.style.height = iframe.offsetHeight + 'px';
      div.style.zIndex = '999';
      document.body.appendChild(div);
      this.tarps.push(div);
    }
  }

  /** Remove all iframe covers. Call from a mouseup handler. */
  uncover() {
    this.tarps.forEach((tarp) => tarp.remove());
    this.tarps = [];
  }
}

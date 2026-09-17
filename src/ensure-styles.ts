/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import { ZPGRAPH_CSS } from "./style-text";

/** Inject default zpgraph CSS once — apps no longer need to import style.css. */
export const ensureZpgraphStyles = (): void => {
  if (typeof document === "undefined") {return;}
  if (document.querySelector("style[data-zpgraph-style]")) {return;}
  const el = document.createElement("style");
  el.setAttribute("data-zpgraph-style", "");
  el.textContent = ZPGRAPH_CSS;
  document.head.appendChild(el);
};

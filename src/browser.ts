/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Browser IIFE entry: attach constructor to window.Zpgraph.
 * Injects base stylesheet once (script-tag users have no CSS bundler).
 */
import Zpgraph from "./zpgraph";
import cssText from "./style.css";

const injectStylesheet = (css: string) => {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById("zpgraph-stylesheet")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "zpgraph-stylesheet";
  style.textContent = css;
  document.head.appendChild(style);
};

injectStylesheet(cssText as unknown as string);

const g = globalThis as typeof globalThis & { Zpgraph?: typeof Zpgraph };
g.Zpgraph = Zpgraph;

export default Zpgraph;

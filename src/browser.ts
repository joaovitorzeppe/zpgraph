/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * Browser IIFE entry: attach constructor to window.Zgraph.
 * Injects base stylesheet once (script-tag users have no CSS bundler).
 */
import Zgraph from './zgraph';
import cssText from './style.css';

function injectStylesheet(css: string) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('zgraph-stylesheet')) return;
  const style = document.createElement('style');
  style.id = 'zgraph-stylesheet';
  style.textContent = css;
  document.head.appendChild(style);
}

injectStylesheet(cssText as unknown as string);

const g = globalThis as typeof globalThis & { Zgraph?: typeof Zgraph };
g.Zgraph = Zgraph;

export default Zgraph;

/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 */

import { ZPGRAPH_CSS } from "./style-text";

const styledRoots = new WeakSet<Document | ShadowRoot>();

const adopt = (root: Document | ShadowRoot, nonce?: string): void => {
  if (styledRoots.has(root)) {
    return;
  }
  if (!nonce && "adoptedStyleSheets" in root && typeof CSSStyleSheet !== "undefined") {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(ZPGRAPH_CSS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      styledRoots.add(root);
      return;
    } catch {
      // jsdom and older engines fall through to a style element.
    }
  }
  const el = document.createElement("style");
  el.setAttribute("data-zpgraph-style", "");
  if (nonce) {
    el.setAttribute("nonce", nonce);
  }
  el.textContent = ZPGRAPH_CSS;
  if (root instanceof ShadowRoot) {
    root.prepend(el);
  } else if (document.head) {
    document.head.prepend(el);
  }
  styledRoots.add(root);
};

/** Inject default zpgraph CSS into the container's document or shadow root. */
export const ensureZpgraphStyles = (
  container?: HTMLElement | null,
  opts?: { nonce?: string; disabled?: boolean },
): void => {
  if (opts?.disabled || typeof document === "undefined") {
    return;
  }
  const node = container?.getRootNode?.();
  const root = node instanceof ShadowRoot ? node : document;
  adopt(root, opts?.nonce);
};

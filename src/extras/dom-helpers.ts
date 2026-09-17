/**
 * @license
 * Copyright (c) 2026 João Vitor Zeppe (zeppejoaovitor@gmail.com)
 * MIT-licensed: https://opensource.org/license/MIT
 *
 * Portions derived from dygraphs — see NOTICE for upstream attribution.
 */

/**
 * The pieces of jQuery and jQuery UI that the extras actually used: an event
 * bus, a horizontal drag, and a few element shortcuts.
 */

/** Set several style properties at once. */
export const setStyle = (
  el: HTMLElement,
  style: Record<string, string>,
): void => {
  for (const name of Object.keys(style)) {
    el.style.setProperty(name, style[name]!);
  }
};

/** Create an element with a class and, optionally, inline styles. */
export const div = (
  className?: string,
  style?: Record<string, string>,
): HTMLDivElement => {
  const el = document.createElement("div");
  if (className) {
    el.className = className;
  }
  if (style) {
    setStyle(el, style);
  }
  return el;
};

/** Show or hide, the way jQuery's toggle(visible) did. */
export const toggle = (el: HTMLElement, visible: boolean): void => {
  el.style.display = visible ? "" : "none";
};

export interface Emitter {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void;
  /** Fire `type` with `detail`, readable as `event.detail`. @private */
  emit_(type: string, detail?: unknown): void;
}

/**
 * Give a plain object the listener methods of an EventTarget, backed by a
 * private one. Callers listen with addEventListener and read the payload from
 * `event.detail` — this replaces jQuery's triggerHandler on a plugin object.
 */
export const makeEmitter = (target: object): void => {
  const bus = new EventTarget();
  const host = target as Emitter;
  host.addEventListener = bus.addEventListener.bind(bus);
  host.removeEventListener = bus.removeEventListener.bind(bus);
  host.emit_ = (type: string, detail?: unknown) => {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
  };
};

export interface DragOptions {
  /** The extras only ever drag along one axis. */
  axis: "x" | "y";
  /** Travel limits, in the same space as `style.left` / `style.top`. */
  bounds: () => { min: number; max: number };
  onStart?: () => void;
  /** Called with the clamped position; moving anything is up to the caller. */
  onMove: (position: number) => void;
  onEnd?: () => void;
}

/**
 * Drag an absolutely positioned element along one axis — the single feature
 * the extras used jQuery UI's draggable for. Returns a teardown function.
 */
export const drag = (el: HTMLElement, opts: DragOptions): (() => void) => {
  const horizontal = opts.axis === "x";
  let pointerId = -1;
  let startClient = 0;
  let startPosition = 0;

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) {
      return;
    }
    const { min, max } = opts.bounds();
    const delta = (horizontal ? e.clientX : e.clientY) - startClient;
    opts.onMove(Math.min(max, Math.max(min, startPosition + delta)));
    e.preventDefault();
  };

  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) {
      return;
    }
    pointerId = -1;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    if (opts.onEnd) {
      opts.onEnd();
    }
  };

  const start = (e: PointerEvent) => {
    // Primary button only, and one drag at a time.
    if (e.button !== 0 || pointerId !== -1) {
      return;
    }
    pointerId = e.pointerId;
    startClient = horizontal ? e.clientX : e.clientY;
    if (opts.onStart) {
      opts.onStart();
    }
    // The element may be positioned by its other edge (an annotation sets
    // `bottom`), in which case the laid-out offset is the honest start.
    const styled = parseFloat(horizontal ? el.style.left : el.style.top);
    startPosition = isNaN(styled)
      ? horizontal
        ? el.offsetLeft
        : el.offsetTop
      : styled;
    // Capture so the drag survives the pointer leaving a thin handle.
    if (el.setPointerCapture) {
      el.setPointerCapture(e.pointerId);
    }
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    e.preventDefault();
    e.stopPropagation();
  };

  el.addEventListener("pointerdown", start);

  return () => {
    el.removeEventListener("pointerdown", start);
    end({ pointerId } as PointerEvent);
  };
};

/**
 * Fill a copy of a `{{key}}` template with `values`.
 *
 * Substitution happens inside text nodes and inside the value of form fields,
 * never in markup: an annotation whose text is `<img onerror=...>` shows up as
 * those characters instead of becoming an element.
 */
export const fillTemplate = (
  template: HTMLElement,
  values: Record<string, unknown>,
): HTMLElement => {
  const clone = template.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");

  const substitute = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
      key in values ? String(values[key]) : whole,
    );

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (text && text.includes("{{")) {
      node.nodeValue = substitute(text);
    }
  }

  for (const field of clone.querySelectorAll("input, textarea")) {
    const input = field as HTMLInputElement;
    if (input.value.includes("{{")) {
      input.value = substitute(input.value);
    }
  }

  return clone;
};

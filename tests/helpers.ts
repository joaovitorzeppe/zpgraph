import { vi } from "vitest";
import type { Data, ZpgraphOptions } from "../src/types";
import { Zpgraph } from "../src/index";

/**
 * jsdom has no canvas implementation and no layout engine, so every chart test
 * needs the same two stubs: a 2d context that records calls, and a div that
 * reports a real size.
 */

type MockFn = (...args: unknown[]) => unknown;

/** Minimal 2d context surface the chart stack actually touches in tests. */
export type Mock2DContext = {
  canvas: HTMLCanvasElement;
  save: MockFn;
  restore: MockFn;
  beginPath: MockFn;
  closePath: MockFn;
  moveTo: MockFn;
  lineTo: MockFn;
  stroke: MockFn;
  fill: MockFn;
  fillRect: MockFn;
  clearRect: MockFn;
  translate: MockFn;
  scale: MockFn;
  transform: MockFn;
  setTransform: MockFn;
  arc: MockFn;
  fillText: MockFn;
  measureText: MockFn;
  createLinearGradient: MockFn;
  setLineDash: MockFn;
  drawImage: MockFn;
  getImageData: MockFn;
  putImageData: MockFn;
  quadraticCurveTo: MockFn;
  bezierCurveTo: MockFn;
  rect: MockFn;
  clip: MockFn;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
};

const makeMock2DContext = (): Mock2DContext => ({
  canvas: document.createElement("canvas"),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  transform: vi.fn(),
  setTransform: vi.fn(),
  arc: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 10 })),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  setLineDash: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  fillStyle: "#000",
  strokeStyle: "#000",
  lineWidth: 1,
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  globalAlpha: 1,
});

const installGetContext = (ctx: Mock2DContext): void => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value(_contextId: string, _options?: unknown) {
      return ctx;
    },
  });
};

export const mockCanvas = (): Mock2DContext => {
  const ctx = makeMock2DContext();
  installGetContext(ctx);
  return ctx;
};

export interface DrawCall {
  op: string;
  args: unknown[];
}

/**
 * Like {@link mockCanvas}, but hands back the same context every time and
 * records the drawing operations in order, so a test can assert on what was
 * actually painted rather than only that nothing threw.
 */
export const recordingCanvas = () => {
  const calls: DrawCall[] = [];
  const record =
    (op: string): MockFn =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };

  const ctx: Mock2DContext = {
    canvas: document.createElement("canvas"),
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillRect: record("fillRect"),
    clearRect: record("clearRect"),
    translate: record("translate"),
    scale: record("scale"),
    transform: record("transform"),
    setTransform: record("setTransform"),
    arc: record("arc"),
    fillText: record("fillText"),
    rect: record("rect"),
    clip: record("clip"),
    quadraticCurveTo: record("quadraticCurveTo"),
    bezierCurveTo: record("bezierCurveTo"),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    globalAlpha: 1,
  };

  installGetContext(ctx);

  return {
    ctx,
    calls,
    ops: () => calls.map((c) => c.op),
    countOf: (op: string) => calls.filter((c) => c.op === op).length,
    clear: () => {
      calls.splice(0, calls.length);
    },
  };
};

/** Force layout metrics jsdom normally zeros out. */
export const stubLayoutMetrics = (
  el: HTMLElement,
  metrics: { width?: number; height?: number; left?: number; top?: number },
) => {
  const w = metrics.width ?? 100;
  const h = metrics.height ?? 20;
  const left = metrics.left ?? 0;
  const top = metrics.top ?? 0;
  Object.defineProperty(el, "offsetWidth", {
    configurable: true,
    get: () => w,
  });
  Object.defineProperty(el, "offsetHeight", {
    configurable: true,
    get: () => h,
  });
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    get: () => w,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => h,
  });
  el.getBoundingClientRect = () => ({
    x: left,
    y: top,
    width: w,
    height: h,
    left,
    top,
    right: left + w,
    bottom: top + h,
    toJSON() {
      return {};
    },
  });
};

export const mountDiv = (width = 480, height = 320) => {
  const el = document.createElement("div");
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  Object.defineProperty(el, "offsetWidth", { get: () => width });
  Object.defineProperty(el, "offsetHeight", { get: () => height });
  Object.defineProperty(el, "clientWidth", { get: () => width });
  Object.defineProperty(el, "clientHeight", { get: () => height });
  document.body.appendChild(el);
  return el;
};

/** Minimal 4-row, 2-series dataset shared by chart tests. */
export const sampleData = [
  [1, 10, 20],
  [2, 15, 25],
  [3, 12, 22],
  [4, 18, 28],
];

/** Build a chart without `as never` / `as Record` casts. */
export const makeChart = (
  data: Data = sampleData,
  opts: Partial<ZpgraphOptions> = {},
): Zpgraph =>
  new Zpgraph(mountDiv(), data, {
    labels: ["x", "A", "B"],
    width: 480,
    height: 320,
    ...opts,
  });

/**
 * Call a method with intentionally invalid runtime args.
 * Keeps type-checker and no-unsafe-type-assertion quiet.
 */
export const callLoose = (
  target: (...args: never[]) => unknown,
  thisArg: unknown,
  args: unknown[],
): unknown => Reflect.apply(target, thisArg, args);

/** Construct Zpgraph with intentionally invalid runtime args. */
export const constructLoose = (...args: unknown[]): Zpgraph =>
  Reflect.construct(Zpgraph, args);

/** Minimal mouse event the interaction model reads (pageX/pageY). */
export const fakeMouse = (pageX: number, pageY: number): MouseEvent => {
  const e = new MouseEvent("mousemove");
  Object.defineProperty(e, "pageX", { value: pageX });
  Object.defineProperty(e, "pageY", { value: pageY });
  Object.defineProperty(e, "preventDefault", { value: vi.fn() });
  Object.defineProperty(e, "stopPropagation", { value: vi.fn() });
  return e;
};

/** Invoke a possibly-untyped method via Reflect (e.g. Record&lt;string, unknown&gt;). */
export const callProp = (
  obj: object,
  key: PropertyKey,
  args: unknown[] = [],
): unknown => {
  const fn: unknown = Reflect.get(obj, key);
  if (typeof fn !== "function") {
    throw new TypeError(`Expected function at ${String(key)}`);
  }
  return Reflect.apply(fn, obj, args);
};

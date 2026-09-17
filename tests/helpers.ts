import { vi } from "vitest";

/**
 * jsdom has no canvas implementation and no layout engine, so every chart test
 * needs the same two stubs: a 2d context that records calls, and a div that
 * reports a real size.
 */
export const mockCanvas = () => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    const ctx: Record<string, unknown> = {
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
    };
    return ctx as unknown as CanvasRenderingContext2D;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
};

export interface DrawCall {
  op: string;
  args: number[];
}

/**
 * Like {@link mockCanvas}, but hands back the same context every time and
 * records the drawing operations in order, so a test can assert on what was
 * actually painted rather than only that nothing threw.
 */
export const recordingCanvas = () => {
  const calls: DrawCall[] = [];
  const record =
    (op: string) =>
    (...args: number[]) => {
      calls.push({ op, args });
    };

  const ctx: Record<string, unknown> = {
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
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ctx as unknown as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    ops: () => calls.map((c) => c.op),
    countOf: (op: string) => calls.filter((c) => c.op === op).length,
    clear: () => calls.splice(0, calls.length),
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

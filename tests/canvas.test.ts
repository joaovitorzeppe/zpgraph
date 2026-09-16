import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Zgraph } from '../src/index';
import ZgraphCanvasRenderer from '../src/canvas';
import { mountDiv, recordingCanvas } from './helpers';

/**
 * The plotters are the innermost loop of every redraw, and Wave 4 adds
 * decimation there. These tests assert what reaches the 2d context, so a
 * change that silently stops drawing something shows up.
 */

const lineData = [
  [1, 10],
  [2, 20],
  [3, 15],
  [4, 25],
];

describe('line plotter', () => {
  let canvas: ReturnType<typeof recordingCanvas>;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = recordingCanvas();
  });

  const chart = (data: unknown[], opts: Record<string, unknown> = {}) =>
    new Zgraph(mountDiv(), data as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
      ...opts,
    }) as unknown as Record<string, any>;

  it('starts a path and strokes one segment per gap-free pair of points', () => {
    const g = chart(lineData);

    expect(canvas.countOf('beginPath')).toBeGreaterThan(0);
    expect(canvas.countOf('stroke')).toBeGreaterThan(0);
    // One moveTo opens the series, then a lineTo for each following point.
    const lineTos = canvas.calls.filter((c) => c.op === 'lineTo');
    expect(lineTos.length).toBeGreaterThanOrEqual(lineData.length - 1);

    g.destroy();
  });

  it('breaks the line at a null value instead of drawing through it', () => {
    const withGap = [
      [1, 10],
      [2, null],
      [3, 15],
      [4, 25],
    ];
    const g = chart(withGap);

    // A gap forces a second moveTo: the line is not continuous.
    expect(canvas.countOf('moveTo')).toBeGreaterThan(1);

    g.destroy();
  });

  it('connectSeparatedPoints draws across the gap', () => {
    const withGap = [
      [1, 10],
      [2, null],
      [3, 15],
      [4, 25],
    ];
    const broken = chart(withGap);
    const brokenMoveTos = canvas.countOf('moveTo');
    broken.destroy();

    canvas.clear();
    document.body.innerHTML = '';
    const joined = chart(withGap, { connectSeparatedPoints: true });
    expect(canvas.countOf('moveTo')).toBeLessThan(brokenMoveTos);
    joined.destroy();
  });

  it('stepPlot adds the horizontal leg of each step', () => {
    const smooth = chart(lineData);
    const smoothLineTos = canvas.countOf('lineTo');
    smooth.destroy();

    canvas.clear();
    document.body.innerHTML = '';
    const stepped = chart(lineData, { stepPlot: true });
    // Every step is two segments instead of one.
    expect(canvas.countOf('lineTo')).toBeGreaterThan(smoothLineTos);
    stepped.destroy();
  });

  it('strokeWidth 0 skips the segments but still walks the series', () => {
    const g = chart(lineData, { strokeWidth: 0 });
    expect(canvas.countOf('stroke')).toBeGreaterThan(0);
    g.destroy();
  });
});

describe('point drawing', () => {
  let canvas: ReturnType<typeof recordingCanvas>;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = recordingCanvas();
  });

  it('drawPoints calls drawPointCallback once per point', () => {
    const drawPointCallback = vi.fn();
    const g = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
      drawPoints: true,
      drawPointCallback,
    }) as unknown as Record<string, any>;

    expect(drawPointCallback).toHaveBeenCalledTimes(lineData.length);
    // g, seriesName, ctx, cx, cy, color, pointSize, idx
    expect(drawPointCallback.mock.calls[0]!).toHaveLength(8);
    expect(drawPointCallback.mock.calls[0]![1]!).toBe('A');

    g.destroy();
  });

  it('an isolated point is drawn even without drawPoints', () => {
    const drawPointCallback = vi.fn();
    const g = new Zgraph(
      mountDiv(),
      [
        [1, null],
        [2, 20],
        [3, null],
      ] as never,
      {
        labels: ['x', 'A'],
        width: 480,
        height: 320,
        drawPointCallback,
      },
    ) as unknown as Record<string, any>;

    expect(drawPointCallback).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('Circles shapes draw an arc', () => {
    const ctx = canvas.ctx;
    canvas.clear();
    const g = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
      drawPoints: true,
      pointSize: 3,
    }) as unknown as Record<string, any>;

    expect(canvas.countOf('arc')).toBeGreaterThan(0);
    expect(ctx).toBeTruthy();
    g.destroy();
  });
});

describe('fill and error plotters', () => {
  let canvas: ReturnType<typeof recordingCanvas>;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = recordingCanvas();
  });

  it('fillGraph fills the area under the line', () => {
    const plain = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
    }) as unknown as Record<string, any>;
    expect(canvas.countOf('fill')).toBe(0);
    plain.destroy();

    canvas.clear();
    document.body.innerHTML = '';
    const filled = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
      fillGraph: true,
    }) as unknown as Record<string, any>;
    expect(canvas.countOf('fill')).toBeGreaterThan(0);
    filled.destroy();
  });

  it('errorBars fill a band around the line', () => {
    const g = new Zgraph(
      mountDiv(),
      [
        [1, [10, 1]],
        [2, [20, 2]],
        [3, [15, 1]],
      ] as never,
      {
        labels: ['x', 'A'],
        width: 480,
        height: 320,
        errorBars: true,
      },
    ) as unknown as Record<string, any>;

    expect(canvas.countOf('fill')).toBeGreaterThan(0);
    g.destroy();
  });

  it('stackedGraph fills every series', () => {
    const g = new Zgraph(
      mountDiv(),
      [
        [1, 10, 5],
        [2, 20, 8],
        [3, 15, 6],
      ] as never,
      {
        labels: ['x', 'A', 'B'],
        width: 480,
        height: 320,
        stackedGraph: true,
      },
    ) as unknown as Record<string, any>;

    expect(canvas.countOf('fill')).toBeGreaterThanOrEqual(2);
    g.destroy();
  });
});

describe('custom plotters', () => {
  let canvas: ReturnType<typeof recordingCanvas>;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = recordingCanvas();
  });

  it('a plotter option replaces the built-in ones', () => {
    const builtin = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
    }) as unknown as Record<string, any>;
    // Grid lines are drawn by the grid plugin, so this is not zero.
    const gridAndSeries = canvas.countOf('lineTo');
    builtin.destroy();

    canvas.clear();
    document.body.innerHTML = '';
    const plotter = vi.fn();
    const g = new Zgraph(mountDiv(), lineData as never, {
      labels: ['x', 'A'],
      width: 480,
      height: 320,
      plotter,
    }) as unknown as Record<string, any>;

    expect(plotter).toHaveBeenCalled();
    const e = plotter.mock.calls[0]![0]!;
    expect(e.setName).toBe('A');
    expect(e.points).toHaveLength(lineData.length);
    expect(e.plotArea.w).toBeGreaterThan(0);
    // The no-op plotter draws nothing, so only the grid is left.
    expect(canvas.countOf('lineTo')).toBeLessThan(gridAndSeries);

    g.destroy();
  });

  it('a per-series plotter only receives that series', () => {
    const seriesPlotter = vi.fn();
    const g = new Zgraph(
      mountDiv(),
      [
        [1, 10, 5],
        [2, 20, 8],
      ] as never,
      {
        labels: ['x', 'A', 'B'],
        width: 480,
        height: 320,
        series: { B: { plotter: seriesPlotter } },
      },
    ) as unknown as Record<string, any>;

    expect(seriesPlotter).toHaveBeenCalled();
    for (const call of seriesPlotter.mock.calls) {
      expect(call[0]!.setName).toBe('B');
    }

    g.destroy();
  });

  it('the three standard plotters are exported for composition', () => {
    const { linePlotter, fillPlotter, errorPlotter } =
      ZgraphCanvasRenderer._Plotters;
    for (const p of [linePlotter, fillPlotter, errorPlotter]) {
      expect(typeof p).toBe('function');
    }
  });
});

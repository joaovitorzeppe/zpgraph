import { describe, expect, it } from 'vitest';
import DefaultHandler from '../src/datahandler/default';
import type { OptionsManagerLike, UnifiedSeries } from '../src/internal-types';

describe('DefaultHandler', () => {
  const handler = new DefaultHandler();

  // Partial double: the handlers only ever ask for labels and per-series options.
  const options = {
    get: (name: string) => {
      if (name === 'labels') return ['x', 'A', 'B'];
      return null;
    },
    getForSeries: () => false,
  } as unknown as OptionsManagerLike;

  it('extractSeries pulls one series column', () => {
    const raw = [
      [1, 10, 20],
      [2, 11, 21],
      [3, 12, 22],
    ];
    const series = handler.extractSeries(raw, 1, options);
    expect(series).toEqual([
      [1, 10],
      [2, 11],
      [3, 12],
    ]);
  });

  // The point objects are reused between draws, so a second call must leave no
  // trace of the first: not a stale field, not a leftover point past the end.
  it('seriesToPoints reuses the point objects without carrying data over', () => {
    const first = handler.seriesToPoints(
      [
        [1, 10],
        [2, 20],
        [3, 30],
      ],
      'A',
      0,
    );
    const reused = first[0]!;
    // Canvas coordinates are written by the renderer after the points are made.
    first[0]!.canvasx = 123;

    const second = handler.seriesToPoints(
      [
        [7, 70],
        [8, 80],
      ],
      'A',
      5,
    );

    expect(second[0]!).toBe(reused);
    expect(second.length).toBe(2);
    expect(second[0]!).toMatchObject({
      xval: 7,
      yval: 70,
      idx: 5,
      canvasx: NaN,
    });
    expect(second[1]!).toMatchObject({ xval: 8, yval: 80, idx: 6 });
  });

  it('seriesToPoints keeps one pool per series', () => {
    const a = handler.seriesToPoints([[1, 10]], 'A', 0);
    const b = handler.seriesToPoints([[1, 99]], 'B', 0);

    expect(b[0]!).not.toBe(a[0]!);
    expect(a[0]!).toMatchObject({ yval: 10, name: 'A' });
    expect(b[0]!).toMatchObject({ yval: 99, name: 'B' });
  });

  it('rollingAverage averages window', () => {
    const data: UnifiedSeries = [
      [1, 2],
      [2, 4],
      [3, 6],
      [4, 8],
    ];
    const rolled = handler.rollingAverage(data, 2, options, 1);
    expect(rolled[0]![1]!).toBe(2);
    expect(rolled[1]![1]!).toBe(3);
    expect(rolled[2]![1]!).toBe(5);
    expect(rolled[3]![1]!).toBe(7);
  });

  it('getExtremeYValues finds min/max', () => {
    const series: UnifiedSeries = [
      [1, 5],
      [2, 1],
      [3, 9],
      [4, null],
    ];
    const [min, max] = handler.getExtremeYValues(series, null, false);
    expect(min).toBe(1);
    expect(max).toBe(9);
  });
});

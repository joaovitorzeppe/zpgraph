import { describe, expect, it } from 'vitest';
import BarsHandler from '../src/datahandler/bars';
import ErrorBarsHandler from '../src/datahandler/bars-error';
import CustomBarsHandler from '../src/datahandler/bars-custom';
import FractionsBarsHandler from '../src/datahandler/bars-fractions';
import DefaultFractionHandler from '../src/datahandler/default-fractions';
import type {
  AxisProperties,
  OptionsManagerLike,
  UnifiedSeries,
} from '../src/internal-types';

/**
 * Fake options object in the same shape the handlers ask for: `get('labels')`
 * plus `getForSeries(name, label)` for logscale/sigma/wilsonInterval.
 */
const makeOptions = (seriesOptions: Record<string, any> = {}) =>
  ({
    get: (name: string) => {
      if (name === 'labels') {return ['x', 'A', 'B'];}
      return null;
    },
    getForSeries: (name: string) =>
      Object.hasOwn(seriesOptions, name)
        ? seriesOptions[name]
        : false,
  }) as unknown as OptionsManagerLike;

/** Extras of a unified sample, which every bars flavour fills in. */
const extras = (sample: UnifiedSeries[number]) =>
  sample[2] as (number | null)[];

/** BarsHandler is abstract; this is the thinnest thing that can be built. */
class BareBarsHandler extends BarsHandler {
  override extractSeries(): UnifiedSeries {
    throw new Error('not implemented');
  }
  override rollingAverage(): UnifiedSeries {
    throw new Error('not implemented');
  }
}

describe('BarsHandler', () => {
  const handler = new BareBarsHandler();

  it('carries no data format of its own', () => {
    // Each bars flavour brings its own extractSeries and rollingAverage, and
    // since they are abstract a subclass that forgets one no longer compiles.
    const proto = BarsHandler.prototype;
    expect(Object.hasOwn(proto, 'extractSeries')).toBe(
      false,
    );
    expect(Object.hasOwn(proto, 'rollingAverage')).toBe(
      false,
    );
  });

  it('seriesToPoints copies the bar extras onto each point', () => {
    const series: UnifiedSeries = [
      [1, 10, [8, 12]],
      [2, 20, [18, 22]],
    ];
    const points = handler.seriesToPoints(series, 'A', 0);
    expect(points).toHaveLength(2);
    expect(points[0]!).toMatchObject({
      xval: 1,
      yval: 10,
      name: 'A',
      idx: 0,
      yval_minus: 8,
      yval_plus: 12,
    });
    expect(points[0]!.y_top).toBeNaN();
    expect(points[0]!.y_bottom).toBeNaN();
    expect(points[1]!).toMatchObject({
      xval: 2,
      yval: 20,
      idx: 1,
      yval_minus: 18,
      yval_plus: 22,
    });
  });

  it('seriesToPoints offsets idx by boundaryIdStart and nulls stay null', () => {
    const points = handler.seriesToPoints([[1, null, [null, null]]], 'A', 3);
    expect(points[0]!.idx).toBe(3);
    expect(points[0]!.yval).toBeNull();
    expect(points[0]!.yval_minus).toBeNaN();
    expect(points[0]!.yval_plus).toBeNaN();
  });

  it('getExtremeYValues spans the bar extras', () => {
    const series: UnifiedSeries = [
      [1, 10, [8, 12]],
      [2, 20, [16, 24]],
      [3, 15, [14, 17]],
    ];
    expect(handler.getExtremeYValues(series, null, false)).toEqual([8, 24]);
  });

  it('getExtremeYValues clamps extras that cross the center value', () => {
    // low > y and high < y both happen with custom bars; the bar is widened to y.
    expect(handler.getExtremeYValues([[1, 5, [7, 9]]], null, false)).toEqual([
      5, 9,
    ]);
    expect(handler.getExtremeYValues([[1, 10, [2, 4]]], null, false)).toEqual([
      2, 10,
    ]);
  });

  it('getExtremeYValues skips null/NaN samples and returns nulls when all are gone', () => {
    const series: UnifiedSeries = [
      [1, null, [null, null]],
      [2, NaN, [NaN, NaN]],
      [3, 7, [6, 8]],
    ];
    expect(handler.getExtremeYValues(series, null, false)).toEqual([6, 8]);
    expect(
      handler.getExtremeYValues([[1, null, [null, null]]], null, false),
    ).toEqual([null, null]);
  });

  it('onLineEvaluated normalizes the error terms on a linear axis', () => {
    const points = handler.seriesToPoints([[1, 10, [8, 12]]], 'A', 0);
    handler.onLineEvaluated(
      points,
      { minyval: 0, yscale: 0.01 } as AxisProperties,
      false,
    );
    // 1 - (value - minyval) * yscale
    expect(points[0]!.y_top).toBeCloseTo(0.92, 10);
    expect(points[0]!.y_bottom).toBeCloseTo(0.88, 10);
  });

  it('onLineEvaluated normalizes the error terms on a log axis', () => {
    const points = handler.seriesToPoints(
      [
        [1, 30, [10, 100]],
        [2, 30, [0, 100]],
      ],
      'A',
      0,
    );
    handler.onLineEvaluated(
      points,
      { minyval: 1, ylogscale: 1 } as unknown as AxisProperties,
      true,
    );
    // 1 - (log10(value) - log10(minyval)) * ylogscale
    expect(points[0]!.y_top).toBeCloseTo(0, 10);
    expect(points[0]!.y_bottom).toBeCloseTo(-1, 10);
    // log10(0) is -Infinity, so the non-finite guard in calcYNormal_ yields NaN.
    expect(points[1]!.y_top).toBeNaN();
  });
});

describe('ErrorBarsHandler', () => {
  const handler = new ErrorBarsHandler();

  it('extractSeries widens each point by sigma * stddev', () => {
    const raw = [
      [1, [10, 1]],
      [2, [20, 2]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions({ sigma: 2 }));
    // extras = [y - sigma*stddev, y + sigma*stddev, raw stddev]
    expect(series).toEqual([
      [1, 10, [8, 12, 1]],
      [2, 20, [16, 24, 2]],
    ]);
  });

  it('extractSeries maps null points and NaN values to empty samples', () => {
    const raw = [
      [1, null],
      [2, [NaN, 1]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions({ sigma: 2 }));
    expect(series[0]!).toEqual([1, null, [null, null, null]]);
    expect(series[1]![0]!).toBe(2);
    expect(series[1]![1]!).toBeNaN();
    expect(series[1]![2]!).toEqual([NaN, NaN, NaN]);
  });

  it('extractSeries drops points whose lower bar reaches zero on a log scale', () => {
    const raw = [
      [1, [10, 1]],
      [2, [1, 1]],
      [3, [0, 0]],
      [4, [-5, 1]],
    ];
    const series = handler.extractSeries(
      raw,
      1,
      makeOptions({ sigma: 2, logscale: true }),
    );
    expect(series[0]!).toEqual([1, 10, [8, 12, 1]]);
    // 1 - 2*1 <= 0, so the whole point disappears and leaves a gap.
    expect(series[1]!).toEqual([2, null, [null, null, null]]);
    expect(series[2]!).toEqual([3, null, [null, null, null]]);
    expect(series[3]!).toEqual([4, null, [null, null, null]]);
  });

  it('extractSeries keeps the same points when logscale is off', () => {
    const series = handler.extractSeries(
      [[1, [1, 1]]],
      1,
      makeOptions({ sigma: 2 }),
    );
    expect(series).toEqual([[1, 1, [-1, 3, 1]]]);
  });

  it('rollingAverage averages values and combines stddevs in quadrature', () => {
    const original: UnifiedSeries = [
      [1, 10, [8, 12, 1]],
      [2, 20, [16, 24, 2]],
    ];
    const rolled = handler.rollingAverage(
      original,
      2,
      makeOptions({ sigma: 2 }),
      1,
    );
    expect(rolled[0]!).toEqual([1, 10, [8, 12]]);
    // mean 15, stddev sqrt(1 + 4)/2, bar = 15 +/- sigma * stddev = 15 +/- sqrt(5)
    expect(rolled[1]![0]!).toBe(2);
    expect(rolled[1]![1]!).toBe(15);
    expect(extras(rolled[1]!)[0]!).toBeCloseTo(15 - Math.sqrt(5), 10);
    expect(extras(rolled[1]!)[1]!).toBeCloseTo(15 + Math.sqrt(5), 10);
  });

  it('rollingAverage skips null samples inside the window', () => {
    const original: UnifiedSeries = [
      [1, 10, [8, 12, 1]],
      [2, null, [null, null, null]],
      [3, 30, [28, 32, 1]],
    ];
    const rolled = handler.rollingAverage(
      original,
      3,
      makeOptions({ sigma: 2 }),
      1,
    );
    expect(rolled[1]!).toEqual([2, 10, [8, 12]]);
    expect(rolled[2]![1]!).toBe(20);
    expect(extras(rolled[2]!)[0]!).toBeCloseTo(20 - Math.sqrt(2), 10);
    expect(extras(rolled[2]!)[1]!).toBeCloseTo(20 + Math.sqrt(2), 10);
  });

  it('rollingAverage preserves NaNs when rollPeriod is 1 and nulls otherwise', () => {
    const opts = makeOptions({ sigma: 2 });
    const kept = handler.rollingAverage(
      [[1, NaN, [NaN, NaN, NaN]]],
      1,
      opts,
      1,
    );
    expect(kept[0]![0]!).toBe(1);
    expect(kept[0]![1]!).toBeNaN();
    expect(kept[0]![2]!).toEqual([NaN, NaN]);

    const dropped = handler.rollingAverage(
      [
        [1, NaN, [NaN, NaN, NaN]],
        [2, NaN, [NaN, NaN, NaN]],
      ],
      2,
      opts,
      1,
    );
    expect(dropped[0]!).toEqual([1, null, [null, null]]);
    expect(dropped[1]!).toEqual([2, null, [null, null]]);
  });

  it('getExtremeYValues uses the inherited bar extremes', () => {
    const series = handler.extractSeries(
      [
        [1, [10, 1]],
        [2, [20, 2]],
      ],
      1,
      makeOptions({ sigma: 2 }),
    );
    expect(handler.getExtremeYValues(series, null, false)).toEqual([8, 24]);
  });

  it('seriesToPoints exposes the error bar bounds', () => {
    const series = handler.extractSeries(
      [[1, [10, 1]]],
      1,
      makeOptions({ sigma: 2 }),
    );
    const points = handler.seriesToPoints(series, 'A', 0);
    expect(points[0]!).toMatchObject({
      xval: 1,
      yval: 10,
      yval_minus: 8,
      yval_plus: 12,
    });
  });
});

describe('CustomBarsHandler', () => {
  const handler = new CustomBarsHandler();

  it('extractSeries takes the middle value as y and the outer ones as extras', () => {
    const raw = [
      [1, [8, 10, 12]],
      [2, [18, 20, 22]],
    ];
    expect(handler.extractSeries(raw, 1, makeOptions())).toEqual([
      [1, 10, [8, 12]],
      [2, 20, [18, 22]],
    ]);
  });

  it('extractSeries maps null points and NaN middles to empty samples', () => {
    const raw = [
      [1, null],
      [2, [1, NaN, 3]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions());
    expect(series[0]!).toEqual([1, null, [null, null]]);
    expect(series[1]![1]!).toBeNaN();
    expect(series[1]![2]!).toEqual([NaN, NaN]);
  });

  it('extractSeries drops points with any non-positive component on a log scale', () => {
    const raw = [
      [1, [8, 10, 12]],
      [2, [0, 10, 12]],
      [3, [8, -1, 12]],
      [4, [8, 10, 0]],
    ];
    const series = handler.extractSeries(
      raw,
      1,
      makeOptions({ logscale: true }),
    );
    expect(series[0]!).toEqual([1, 10, [8, 12]]);
    expect(series[1]!).toEqual([2, null, [null, null]]);
    expect(series[2]!).toEqual([3, null, [null, null]]);
    expect(series[3]!).toEqual([4, null, [null, null]]);
  });

  it('rollingAverage averages low/mid/high over a sliding window', () => {
    const original: UnifiedSeries = [
      [1, 10, [8, 12]],
      [2, 20, [18, 22]],
      [3, 30, [28, 32]],
    ];
    const rolled = handler.rollingAverage(original, 2, makeOptions(), 1);
    expect(rolled).toEqual([
      [1, 10, [8, 12]],
      [2, 15, [13, 17]],
      [3, 25, [23, 27]],
    ]);
  });

  it('rollingAverage keeps the window sums clean of null samples', () => {
    const original: UnifiedSeries = [
      [1, 10, [8, 12]],
      [2, null, [null, null]],
      [3, 30, [28, 32]],
    ];
    const rolled = handler.rollingAverage(original, 2, makeOptions(), 1);
    expect(rolled[0]!).toEqual([1, 10, [8, 12]]);
    // Only the sample at x=1 is inside the window, so the average stays 10.
    expect(rolled[1]!).toEqual([2, 10, [8, 12]]);
    // x=1 leaves the window at i=2, leaving only x=3.
    expect(rolled[2]!).toEqual([3, 30, [28, 32]]);
  });

  it('rollingAverage emits a null sample when the window is empty', () => {
    const rolled = handler.rollingAverage(
      [[1, null, [null, null]]],
      1,
      makeOptions(),
      1,
    );
    expect(rolled).toEqual([[1, null, [null, null]]]);
  });

  it('getExtremeYValues spans the custom bars', () => {
    const series = handler.extractSeries(
      [
        [1, [8, 10, 12]],
        [2, [18, 20, 22]],
      ],
      1,
      makeOptions(),
    );
    expect(handler.getExtremeYValues(series, null, false)).toEqual([8, 22]);
  });

  it('seriesToPoints exposes the custom bar bounds', () => {
    const points = handler.seriesToPoints([[1, 10, [8, 12]]], 'A', 0);
    expect(points[0]!).toMatchObject({
      xval: 1,
      yval: 10,
      yval_minus: 8,
      yval_plus: 12,
    });
  });
});

describe('FractionsBarsHandler', () => {
  const handler = new FractionsBarsHandler();
  // sigma * sqrt(p * (1 - p) / den) for p = 1/4 and den = 4, which is also the
  // value for p = 3/4 since p * (1 - p) is symmetric.
  const stddevQuarter = 2 * Math.sqrt((0.25 * 0.75) / 4);

  it('extractSeries turns numerator/denominator into a percentage with a bar', () => {
    const raw = [
      [1, [1, 4]],
      [2, [3, 4]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions({ sigma: 2 }));
    expect(series[0]![0]!).toBe(1);
    expect(series[0]![1]!).toBe(25);
    expect(extras(series[0]!)[0]!).toBeCloseTo(25 - 100 * stddevQuarter, 10);
    expect(extras(series[0]!)[1]!).toBeCloseTo(25 + 100 * stddevQuarter, 10);
    // The raw numerator/denominator are preserved for rollingAverage.
    expect(extras(series[0]!)[2]!).toBe(1);
    expect(extras(series[0]!)[3]!).toBe(4);
    expect(series[1]![1]!).toBe(75);
    expect(extras(series[1]!)[2]!).toBe(3);
    expect(extras(series[1]!)[3]!).toBe(4);
  });

  it('extractSeries falls back to stddev 1 when the denominator is zero', () => {
    const series = handler.extractSeries(
      [[1, [5, 0]]],
      1,
      makeOptions({ sigma: 2 }),
    );
    expect(series[0]!).toEqual([1, 0, [-100, 100, 5, 0]]);
  });

  it('extractSeries maps null points and NaN numerators to empty samples', () => {
    const raw = [
      [1, null],
      [2, [NaN, 4]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions({ sigma: 2 }));
    expect(series[0]!).toEqual([1, null, [null, null, null, null]]);
    expect(series[1]![1]!).toBeNaN();
    expect(extras(series[1]!)[3]!).toBe(4);
  });

  it('extractSeries drops non-positive numerators/denominators on a log scale', () => {
    const raw = [
      [1, [1, 4]],
      [2, [0, 4]],
      [3, [1, 0]],
    ];
    const series = handler.extractSeries(
      raw,
      1,
      makeOptions({ sigma: 2, logscale: true }),
    );
    expect(series[0]![1]!).toBe(25);
    expect(series[1]!).toEqual([2, null, [null, null, null, null]]);
    expect(series[2]!).toEqual([3, null, [null, null, null, null]]);
  });

  it('rollingAverage sums numerators and denominators over the window', () => {
    const original: UnifiedSeries = [
      [1, 25, [0, 0, 1, 4]],
      [2, 75, [0, 0, 3, 4]],
    ];
    const rolled = handler.rollingAverage(
      original,
      2,
      makeOptions({ sigma: 2 }),
      1,
    );
    expect(rolled[0]![1]!).toBe(25);
    expect(extras(rolled[0]!)[0]!).toBeCloseTo(25 - 100 * stddevQuarter, 10);
    expect(extras(rolled[0]!)[1]!).toBeCloseTo(25 + 100 * stddevQuarter, 10);
    // 4/8 = 50%, stddev = 2 * sqrt(0.5 * 0.5 / 8)
    const stddevHalf = 2 * Math.sqrt((0.5 * 0.5) / 8);
    expect(rolled[1]![1]!).toBe(50);
    expect(extras(rolled[1]!)[0]!).toBeCloseTo(100 * (0.5 - stddevHalf), 10);
    expect(extras(rolled[1]!)[1]!).toBeCloseTo(100 * (0.5 + stddevHalf), 10);
  });

  it('rollingAverage drops samples that leave the window', () => {
    const original: UnifiedSeries = [
      [1, 25, [0, 0, 1, 4]],
      [2, 75, [0, 0, 3, 4]],
      [3, 50, [0, 0, 2, 4]],
    ];
    const rolled = handler.rollingAverage(
      original,
      2,
      makeOptions({ sigma: 2 }),
      1,
    );
    // i=2: num = 3 + 2, den = 4 + 4 -> 62.5%
    expect(rolled[2]![0]!).toBe(3);
    expect(rolled[2]![1]!).toBe(62.5);
  });

  it('rollingAverage uses the Wilson interval when asked', () => {
    const original: UnifiedSeries = [[1, 25, [0, 0, 1, 4]]];
    const rolled = handler.rollingAverage(
      original,
      1,
      makeOptions({ sigma: 2, wilsonInterval: true }),
      1,
    );
    // p = 0.25, n = 4, sigma = 2
    const pm = 2 * Math.sqrt((0.25 * 0.75) / 4 + 4 / (4 * 16));
    const denom = 1 + 4 / 4;
    expect(rolled[0]![0]!).toBe(1);
    expect(rolled[0]![1]!).toBe(25);
    expect(extras(rolled[0]!)[0]!).toBeCloseTo(
      100 * ((0.25 + 4 / 8 - pm) / denom),
      10,
    );
    expect(extras(rolled[0]!)[1]!).toBeCloseTo(
      100 * ((0.25 + 4 / 8 + pm) / denom),
      10,
    );
  });

  it('rollingAverage returns a flat zero bar for an empty Wilson denominator', () => {
    const rolled = handler.rollingAverage(
      [[1, 0, [0, 0, 0, 0]]],
      1,
      makeOptions({ sigma: 2, wilsonInterval: true }),
      1,
    );
    expect(rolled).toEqual([[1, 0, [0, 0]]]);
  });

  it('getExtremeYValues spans the fraction bars', () => {
    const series = handler.extractSeries(
      [
        [1, [1, 4]],
        [2, [3, 4]],
      ],
      1,
      makeOptions({ sigma: 2 }),
    );
    const [min, max] = handler.getExtremeYValues(series, null, false);
    expect(min).toBeCloseTo(25 - 100 * stddevQuarter, 10);
    expect(max).toBeCloseTo(75 + 100 * stddevQuarter, 10);
  });

  it('seriesToPoints exposes the fraction bar bounds', () => {
    const series = handler.extractSeries(
      [[1, [1, 4]]],
      1,
      makeOptions({ sigma: 2 }),
    );
    const points = handler.seriesToPoints(series, 'A', 0);
    expect(points[0]!.yval).toBe(25);
    expect(points[0]!.yval_minus).toBeCloseTo(25 - 100 * stddevQuarter, 10);
    expect(points[0]!.yval_plus).toBeCloseTo(25 + 100 * stddevQuarter, 10);
  });
});

describe('DefaultFractionHandler', () => {
  const handler = new DefaultFractionHandler();

  it('extractSeries converts fractions to percentages and keeps the raw pair', () => {
    const raw = [
      [1, [1, 4]],
      [2, [3, 4]],
    ];
    expect(handler.extractSeries(raw, 1, makeOptions())).toEqual([
      [1, 25, [1, 4]],
      [2, 75, [3, 4]],
    ]);
  });

  it('extractSeries yields 0% for a zero denominator', () => {
    expect(handler.extractSeries([[1, [5, 0]]], 1, makeOptions())).toEqual([
      [1, 0, [5, 0]],
    ]);
  });

  it('extractSeries maps null points and NaN numerators to empty samples', () => {
    const raw = [
      [1, null],
      [2, [NaN, 4]],
    ];
    const series = handler.extractSeries(raw, 1, makeOptions());
    expect(series[0]!).toEqual([1, null, [null, null]]);
    expect(series[1]![1]!).toBeNaN();
    expect(series[1]![2]!).toEqual([NaN, 4]);
  });

  it('extractSeries drops non-positive numerators/denominators on a log scale', () => {
    const raw = [
      [1, [1, 4]],
      [2, [0, 4]],
      [3, [1, -2]],
    ];
    const series = handler.extractSeries(
      raw,
      1,
      makeOptions({ logscale: true }),
    );
    expect(series[0]!).toEqual([1, 25, [1, 4]]);
    expect(series[1]!).toEqual([2, null, [null, null]]);
    expect(series[2]!).toEqual([3, null, [null, null]]);
  });

  it('rollingAverage aggregates the fractions instead of averaging percentages', () => {
    const original: UnifiedSeries = [
      [1, 25, [1, 4]],
      [2, 75, [3, 4]],
      [3, 50, [2, 4]],
    ];
    // The result drops the extras column, so it is not re-rollable.
    expect(handler.rollingAverage(original, 2, makeOptions(), 1)).toEqual([
      [1, 25],
      [2, 50],
      [3, 62.5],
    ]);
  });

  it('rollingAverage with period 1 mirrors the extracted percentages', () => {
    const original: UnifiedSeries = [
      [1, 25, [1, 4]],
      [2, 75, [3, 4]],
    ];
    expect(handler.rollingAverage(original, 1, makeOptions(), 1)).toEqual([
      [1, 25],
      [2, 75],
    ]);
  });

  it('getExtremeYValues uses the plain min/max inherited from DefaultHandler', () => {
    const series = handler.extractSeries(
      [
        [1, [1, 4]],
        [2, [3, 4]],
        [3, null],
      ],
      1,
      makeOptions(),
    );
    expect(handler.getExtremeYValues(series, null, false)).toEqual([25, 75]);
  });

  it('seriesToPoints produces plain points without bar bounds', () => {
    const series = handler.extractSeries([[1, [1, 4]]], 1, makeOptions());
    const points = handler.seriesToPoints(series, 'A', 2);
    expect(points[0]!).toMatchObject({ xval: 1, yval: 25, name: 'A', idx: 2 });
    expect(points[0]!.yval_minus).toBeUndefined();
    expect(points[0]!.y_top).toBeUndefined();
  });
});

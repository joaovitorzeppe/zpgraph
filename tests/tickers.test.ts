import { describe, expect, it } from 'vitest';
import {
  Granularity,
  numericTicks,
  pickDateTickGranularity,
} from '../src/tickers';

describe('tickers', () => {
  const opts = (name: string) => {
    if (name === 'pixelsPerLabel') return 30;
    if (name === 'axisTickSize') return 3;
    if (name === 'axisLabelFormatter') {
      return (v: number) => String(v);
    }
    return null;
  };

  it('numericTicks returns ticks in range', () => {
    const ticks = numericTicks(0, 100, 300, opts, null as never, null as never);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks[0]!.v).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]!.v).toBeLessThanOrEqual(100);
  });

  it('pickDateTickGranularity returns a granularity', () => {
    const g = pickDateTickGranularity(
      Date.UTC(2020, 0, 1),
      Date.UTC(2020, 0, 10),
      400,
      opts,
    );
    expect(typeof g).toBe('number');
    expect(g).toBeGreaterThanOrEqual(Granularity.MILLISECONDLY);
  });
});

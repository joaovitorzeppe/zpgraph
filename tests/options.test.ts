import { describe, expect, it } from 'vitest';
import OptionsManager from '../src/options';

describe('options cascade', () => {
  it('reads global then series overrides', () => {
    const fake = {
      attrs_: {
        strokeWidth: 1,
        labels: ['x', 'A', 'B'],
      },
      user_attrs_: {
        strokeWidth: 2,
        labels: ['x', 'A', 'B'],
        series: {
          A: { strokeWidth: 3 },
        },
      },
      getLabels: () => ['x', 'A', 'B'],
      getHighlightSeries: () => '',
    };

    const opts = new OptionsManager(fake as never);
    expect(opts.get('strokeWidth')).toBe(2);
    expect(opts.getForSeries('strokeWidth', 'A')).toBe(3);
    expect(opts.getForSeries('strokeWidth', 'B')).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import type { ZgraphOptions } from '../src/types';

/**
 * ZgraphOptions has no index signature, so a misspelled option is a compile
 * error rather than a silently ignored key. `tsc --noEmit` covers tests/, so
 * the @ts-expect-error lines below fail the typecheck if the signature ever
 * comes back.
 */
describe('ZgraphOptions rejects unknown keys at compile time', () => {
  it('accepts documented options', () => {
    const opts = {
      labels: ['x', 'A'],
      strokeWidth: 2,
      legend: 'always',
      axes: { y: { valueRange: [0, 10] } },
      series: { A: { color: '#f00' } },
      rangeSelectorAlpha: 0.5,
      annotationClickHandler: () => {},
    } satisfies ZgraphOptions;

    expect(opts.labels).toEqual(['x', 'A']);
  });

  it('rejects a typo', () => {
    const opts: ZgraphOptions = {
      // @ts-expect-error strokeWidht is not an option
      strokeWidht: 2,
    };
    expect(opts).toBeDefined();
  });

  it('rejects an option that does not exist at all', () => {
    const opts: ZgraphOptions = {
      // @ts-expect-error there is no such option
      nonsenseOption: true,
    };
    expect(opts).toBeDefined();
  });
});

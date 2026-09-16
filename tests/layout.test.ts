import { describe, expect, it } from 'vitest';
import ZgraphLayout from '../src/layout';

describe('layout', () => {
  it('computes plot area and stores datasets', () => {
    const fake = {
      width_: 400,
      height_: 200,
      getOption: (name: string) => (name === 'rightGap' ? 5 : null),
      cascadeEvents_: () => {},
      graphDiv: document.createElement('div'),
    };

    const layout = new ZgraphLayout(fake as never);
    layout.computePlotArea();
    expect(layout.getPlotArea()).toEqual({ x: 0, y: 0, w: 395, h: 200 });

    layout.addDataset('A', [{ idx: 0, name: 'A', xval: 1, yval: 2 }]);
    expect(layout.setNames).toEqual(['A']);
    expect(layout.points).toHaveLength(1);
  });
});

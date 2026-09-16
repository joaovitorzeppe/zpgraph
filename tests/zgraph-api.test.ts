import { describe, expect, it } from 'vitest';
import { Zgraph } from '../src/index';

describe('Zgraph package surface', () => {
  it('exports constructor and version', () => {
    expect(typeof Zgraph).toBe('function');
    expect(Zgraph.VERSION).toBe('0.1.0');
    expect(Zgraph.NAME).toBe('Zgraph');
  });

  it('exposes plugins and data handlers', () => {
    expect(Zgraph.Plugins.Legend).toBeTruthy();
    expect(Zgraph.Plugins.Axes).toBeTruthy();
    expect(Zgraph.DataHandlers.DefaultHandler).toBeTruthy();
    expect(Zgraph.PLUGINS.length).toBeGreaterThan(0);
  });
});

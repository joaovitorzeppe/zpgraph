import { describe, it, expect, afterEach, vi } from 'vitest';
import Zgraph from '../src/zgraph';
import { setLogger } from '../src/logger';
import { mockCanvas, mountDiv, sampleData } from './helpers';

describe('logger injetável', () => {
  afterEach(() => setLogger(null));

  it('desvia os diagnósticos da lib para o logger instalado', () => {
    mockCanvas();
    const warn = vi.fn();
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLogger({ log: vi.fn(), warn, error: vi.fn() });

    const g = new Zgraph(mountDiv(), sampleData, { labels: ['x', 'a', 'b'] });
    g.setVisibility(99, false); // série inexistente: avisa e ignora

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('setVisibility');
    expect(consoleWarn).not.toHaveBeenCalled();

    setLogger(null);
    g.setVisibility(99, false);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();

    consoleWarn.mockRestore();
  });
});

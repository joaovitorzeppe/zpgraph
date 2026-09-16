import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/style.css', () => ({ default: '/* zgraph css */' }));

describe('browser entry', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete (globalThis as { Zgraph?: unknown }).Zgraph;
  });

  it('exports default and sets globalThis.Zgraph', async () => {
    const mod = await import('../src/browser');

    expect(mod.default).toBeTruthy();
    expect(
      (globalThis as typeof globalThis & { Zgraph?: unknown }).Zgraph,
    ).toBe(mod.default);
    expect(document.getElementById('zgraph-stylesheet')?.textContent).toBe(
      '/* zgraph css */',
    );
  });
});

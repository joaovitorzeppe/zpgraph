import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Zgraph } from '../src/index';
import { mockCanvas, mountDiv } from './helpers';

describe('Zgraph URL data load via fetch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads CSV from URL with fetch', async () => {
    const csv = 'X,A,B\n1,10,20\n2,15,25\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(csv),
        }),
      ),
    );

    const g = new Zgraph(mountDiv(), 'https://example.test/data.csv', {
      labels: ['X', 'A', 'B'],
      width: 480,
      height: 320,
    });

    await vi.waitFor(() => {
      expect(g.numRows()).toBe(2);
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/data.csv',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    g.destroy();
  });

  it('aborts in-flight fetch on destroy', async () => {
    let rejectFetch: ((err: Error) => void) | undefined;
    const fetchPromise = new Promise((_resolve, reject) => {
      rejectFetch = reject;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          rejectFetch?.(err);
        });
        return fetchPromise;
      }),
    );

    const g = new Zgraph(mountDiv(), 'https://example.test/slow.csv', {
      labels: ['X', 'A'],
      width: 480,
      height: 320,
    });

    expect(fetch).toHaveBeenCalled();
    g.destroy();
    await expect(fetchPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports a failed load through dataLoadErrorCallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503, text: () => '' })),
    );
    const onError = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const g = new Zgraph(mountDiv(), 'https://example.test/down.csv', {
      labels: ['X', 'A'],
      width: 480,
      height: 320,
      dataLoadErrorCallback: onError,
    });

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    const [error, url] = onError.mock.calls[0]!;
    expect((error as Error).message).toContain('503');
    expect(url).toBe('https://example.test/down.csv');
    // The callback takes over; the failure is not also logged.
    expect(
      consoleError.mock.calls.some((args) =>
        String(args[0]!).includes('Failed to load chart data'),
      ),
    ).toBe(false);

    g.destroy();
  });
});

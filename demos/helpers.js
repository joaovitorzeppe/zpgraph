/** Shared demo data helpers (browser ESM). */

export const dayMs = 86400000;

export const utcDay = (y, m, d) => Date.UTC(y, m, d);

/** Dense timeseries: [Date, ...values] */
export const makeSeries = (opts = {}) => {
  const {
    points = 90,
    start = utcDay(2024, 0, 1),
    step = dayMs,
    series = 2,
    seed = 1,
  } = opts;

  const data = [];
  for (let i = 0; i < points; i++) {
    const row = [new Date(start + i * step)];
    for (let s = 0; s < series; s++) {
      const phase = (s + 1) * 0.7 + seed * 0.13;
      const base = 18 + s * 7 + seed;
      const wave = Math.sin(i / (6 + s) + phase) * (6 + s * 2);
      const noise = ((i * (s + 3) * seed) % 7) - 3;
      row.push(base + wave + noise);
    }
    data.push(row);
  }
  return data;
};

/** Dual-scale series (small + large magnitude). */
export const makeDualAxisData = (points = 80) => {
  const data = [];
  const start = utcDay(2024, 2, 1);
  for (let i = 0; i < points; i++) {
    data.push([
      new Date(start + i * dayMs),
      20 + Math.sin(i / 9) * 8,
      18 + Math.cos(i / 7) * 5,
      1e5 * (1.2 + Math.sin(i / 11) * 0.4),
      1e5 * (1.5 + Math.cos(i / 13) * 0.35),
    ]);
  }
  return data;
};

/** Custom bars: [Date, [low, mid, high], ...] */
export const makeCustomBars = (points = 60) => {
  const data = [];
  const start = utcDay(2023, 5, 1);
  for (let i = 0; i < points; i++) {
    const ny = 55 + Math.sin(i / 8) * 12 + (i % 5);
    const sf = 62 + Math.cos(i / 10) * 8 + (i % 4);
    data.push([
      new Date(start + i * dayMs),
      [ny - 4, ny, ny + 5],
      [sf - 3, sf, sf + 4],
    ]);
  }
  return data;
};

/** Error bars: [Date, [value, stddev], ...] */
export const makeErrorBars = (points = 50) => {
  const data = [];
  const start = utcDay(2024, 4, 1);
  for (let i = 0; i < points; i++) {
    const v = 40 + Math.sin(i / 5) * 10;
    data.push([new Date(start + i * dayMs), [v, 2 + (i % 3)]]);
  }
  return data;
};

/** Completely new random dataset (different length + series count). */
export const randomDataset = () => {
  const series = 2 + Math.floor(Math.random() * 3);
  const points = 40 + Math.floor(Math.random() * 120);
  const seed = 1 + Math.floor(Math.random() * 200);
  const start = utcDay(2020 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), 1);
  const data = makeSeries({ points, series, seed, start });
  const labels = ['Date', ...Array.from({ length: series }, (_, i) => `S${i + 1}`)];
  const colors = ['#1b6b93', '#c45c26', '#2a9d8f', '#6d597a', '#e9c46a'].slice(0, series);
  return { data, labels, colors, title: `Random · ${points} pts · ${series} series` };
};

export const importMap = {
  imports: { 'zpgraph': '../dist/index.js' },
};

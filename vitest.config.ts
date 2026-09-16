import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The extras import the package by name, the way a consumer would.
  resolve: {
    alias: { 'zpgraph': new URL('./src/index.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'jsdom',
    // Shared jsdom across files: ~60% of runtime was env setup. Revisit if flaky.
    isolate: false,
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/options-reference.ts', 'src/shims.d.ts'],
      reporter: ['text-summary', 'json-summary'],
      // A ratchet, not a target: raise these whenever a wave leaves the tree
      // above them. They exist so a later wave cannot delete coverage while
      // rewriting the hot path.
      thresholds: {
        statements: 72,
        branches: 58,
        functions: 77,
        lines: 73,
      },
    },
  },
});

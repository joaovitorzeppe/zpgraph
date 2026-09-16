import { defineConfig } from "tsup";

const shared = {
  target: "es2020" as const,
  sourcemap: true,
  treeshake: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
  },
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      "extras/crosshair": "src/extras/crosshair.ts",
      "extras/hairlines": "src/extras/hairlines.ts",
      "extras/rebase": "src/extras/rebase.ts",
      "extras/shapes": "src/extras/shapes.ts",
      "extras/smooth-plotter": "src/extras/smooth-plotter.ts",
      "extras/super-annotations": "src/extras/super-annotations.ts",
      "extras/synchronizer": "src/extras/synchronizer.ts",
      "extras/unzoom": "src/extras/unzoom.ts",
    },
    format: ["esm", "cjs"],
    // Declarations come from `tsc -p tsconfig.build.json`, not from tsup:
    // tsup bundles rollup-plugin-dts, which does not run on TypeScript 7.
    dts: false,
    clean: true,
    splitting: false,
    external: ["zpgraph"],
    outDir: "dist",
  },
  {
    ...shared,
    entry: { "zpgraph.min": "src/browser.ts" },
    format: ["iife"],
    minify: true,
    outDir: "dist",
    clean: false,
    globalName: "ZpgraphBundle",
    // Inline CSS text into the IIFE so <script> users get styles without a bundler.
    loader: { ".css": "text" },
    footer: {
      js: 'typeof window!=="undefined"&&(window.Zpgraph=ZpgraphBundle.default||ZpgraphBundle);',
    },
  },
]);

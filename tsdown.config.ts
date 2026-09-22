import { defineConfig } from "tsdown";

export default defineConfig({
  target: "es2023",
  sourcemap: true,
  treeshake: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
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
    "extras/locale": "src/extras/locale.ts",
    "extras/zoom-limits": "src/extras/zoom-limits.ts",
    "extras/measure": "src/extras/measure.ts",
    "extras/keyboard": "src/extras/keyboard.ts",
    "extras/brush-select": "src/extras/brush-select.ts",
    "extras/url-sync": "src/extras/url-sync.ts",
    "extras/moving-average": "src/extras/moving-average.ts",
    "extras/fill-between": "src/extras/fill-between.ts",
    "extras/span-bands": "src/extras/span-bands.ts",
  },
  format: ["esm"],
  // Declarations come from `tsc -p tsconfig.build.json`, not from tsdown:
  // tsdown auto-enables dts when package.json has `types`; keep off for TS 7.
  dts: false,
  clean: true,
  platform: "browser",
  fixedExtension: false,
  deps: { neverBundle: ["zpgraph"] },
  outDir: "dist",
});

/**
 * Import the built package in plain Node, with no bundler and no DOM.
 *
 * This is the check for the packaging bug where the entry did
 * `import './style.css'`: bundlers resolved it, Node threw
 * ERR_UNKNOWN_FILE_EXTENSION, and the library could not be used from SSR.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const esm = await import("../dist/index.js");
assert.equal(typeof esm.default, "function", "default export must be Zpgraph");
assert.equal(typeof esm.Zpgraph, "function", "named Zpgraph export missing");
assert.ok(Object.keys(esm.tickers).length > 0, "tickers namespace is empty");

const cjs = createRequire(import.meta.url)("../dist/index.cjs");
assert.equal(
  typeof cjs.default,
  "function",
  "CJS default export must be Zpgraph",
);

// Internals that used to leak through `export * as utils` and the statics.
for (const name of ["toRGB_", "dragGetX_", "dragGetY_", "setupDOMready_"]) {
  assert.ok(!(name in esm.utils), `utils still exposes ${name}`);
}
for (const name of ["toRGB_", "dateString_", "nonInteractiveModel_"]) {
  assert.ok(!(name in esm.default), `Zpgraph still exposes ${name}`);
}

console.log("node smoke ok: ESM + CJS import with no bundler, no DOM");

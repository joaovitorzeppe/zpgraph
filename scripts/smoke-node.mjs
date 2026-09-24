/**
 * Import the built package in plain Node, with no bundler and no DOM.
 *
 * This is the check for the packaging bug where the entry did
 * `import './style.css'`: bundlers resolved it, Node threw
 * ERR_UNKNOWN_FILE_EXTENSION, and the library could not be used from SSR.
 */
import assert from "node:assert/strict";

const esm = await import("../dist/index.js");
assert.equal(esm.default, undefined, "default export was removed in 2.0");
assert.equal(typeof esm.Zpgraph, "function", "named Zpgraph export missing");
assert.equal(
  typeof esm.defaultInteractionModel,
  "object",
  "named defaultInteractionModel missing",
);
assert.ok(Object.keys(esm.tickers).length > 0, "tickers namespace is empty");

for (const name of ["toRGB_", "dragGetX_", "dragGetY_", "setupDOMready_"]) {
  assert.ok(!(name in esm.utils), `utils still exposes ${name}`);
}
for (const name of ["toRGB_", "dateString_", "nonInteractiveModel_"]) {
  assert.ok(!(name in esm.Zpgraph), `Zpgraph still exposes ${name}`);
}

console.log("node smoke ok: ESM import with no bundler, no DOM");

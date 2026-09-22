/**
 * Node16 ESM resolves only extensioned relative specifiers in .d.ts.
 * tsc (moduleResolution bundler) emits extensionless — append .js after emit.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "dist");

/** @param {string} dir */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!name.endsWith(".d.ts") || name.endsWith(".d.ts.map")) continue;
    fixFile(path);
  }
}

/** @param {string} file */
function fixFile(file) {
  const src = readFileSync(file, "utf8");
  const next = src.replace(
    /(\bfrom\s+|import\s*\(\s*)(["'])(\.[^"']+)\2/g,
    (match, prefix, quote, spec) => {
      if (/\.(js|mjs|cjs|json|css|svg|wasm)$/i.test(spec)) return match;
      return `${prefix}${quote}${spec}.js${quote}`;
    },
  );
  if (next !== src) writeFileSync(file, next);
}

walk(ROOT);

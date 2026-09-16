import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

// Only the stylesheet: type declarations come from tsup's `dts: true`.
copyFileSync(join(root, 'src/style.css'), join(dist, 'style.css'));

console.log('copied style.css → dist/');

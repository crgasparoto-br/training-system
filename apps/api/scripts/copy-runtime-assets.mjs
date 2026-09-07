import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');
const source = resolve(apiDir, 'src/scripts/exercises-data.json');
const target = resolve(apiDir, 'dist/scripts/exercises-data.json');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('Runtime asset copied: dist/scripts/exercises-data.json');

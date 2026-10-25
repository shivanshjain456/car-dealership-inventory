import { cpSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));
const target = fileURLToPath(new URL('../dist/db/migrations/', import.meta.url));
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, { recursive: true, force: true });

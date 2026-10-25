import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(moduleDirectory, '../../..');
export const WEB_DIRECTORY = resolve(PROJECT_ROOT, 'apps/web/dist');

export function loadProjectEnvironment(): void {
  dotenv.config({ path: resolve(PROJECT_ROOT, '.env') });
}

export function resolveProjectPath(path: string): string {
  return isAbsolute(path) ? path : resolve(PROJECT_ROOT, path);
}

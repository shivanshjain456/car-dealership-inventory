import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const E2E_DATABASE_PATH = resolve(PROJECT_ROOT, 'apps/api/data/e2e.sqlite');
export const E2E_SCREENSHOT_DIR = resolve(PROJECT_ROOT, 'screenshots');
export const E2E_JWT_SECRET = 'e2e-only-secret-do-not-use-outside-tests-2026';
export const E2E_ADMIN_EMAIL = 'admin@motorline.test';
export const E2E_ADMIN_PASSWORD = 'motorline-admin-passphrase';

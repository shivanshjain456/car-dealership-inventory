import { defineConfig, devices } from '@playwright/test';
import { E2E_DATABASE_PATH, E2E_JWT_SECRET, PROJECT_ROOT } from './constants.js';

const commonEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_PATH: E2E_DATABASE_PATH,
  JWT_SECRET: E2E_JWT_SECRET,
  AUTH_RATE_LIMIT_MAX: '1000'
};

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 980 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'npm run dev --workspace @motorline/api',
      cwd: PROJECT_ROOT,
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...commonEnvironment, PORT: '3001' }
    },
    {
      command: 'npm run dev --workspace @motorline/web',
      cwd: PROJECT_ROOT,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: 'test' }
    }
  ]
});

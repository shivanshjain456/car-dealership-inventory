import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const SECRET = 'locally-generated-test-secret-at-least-32-characters';

describe('runtime configuration', () => {
  it('parses bounded settings and applies safe defaults', () => {
    expect(loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET })).toEqual({
      environment: 'test',
      port: 3001,
      databasePath: './data/motorline.sqlite',
      jwtSecret: SECRET,
      authRateLimitMax: 10,
      logLevel: 'info'
    });
  });

  it('fails closed when the signing secret is missing, weak, or still a placeholder', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'short-secret' })).toThrow();
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        JWT_SECRET: 'replace-with-a-random-secret-using-npm-run-setup'
      })
    ).toThrow();
  });

  it('rejects invalid environment values rather than silently coercing them', () => {
    expect(() => loadConfig({ NODE_ENV: 'preview', JWT_SECRET: SECRET })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '0', JWT_SECRET: SECRET })).toThrow();
    expect(() =>
      loadConfig({ NODE_ENV: 'test', AUTH_RATE_LIMIT_MAX: 'not-a-number', JWT_SECRET: SECRET })
    ).toThrow();
  });
});

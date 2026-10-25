import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from '../src/auth/service.js';
import { clearTestSystem, createTestSystem, type TestSystem } from './helpers.js';

const PASSWORD = 'local-admin-passphrase';
let system: TestSystem | undefined;

beforeEach(() => {
  system = createTestSystem();
});

afterEach(() => {
  clearTestSystem(system);
  system = undefined;
});

describe('one-time local Admin bootstrap', () => {
  it('creates an Admin outside public registration and stores only a password hash', async () => {
    const service = createAuthService(
      system!.database,
      'integration-test-secret-which-is-at-least-32-chars'
    );
    const admin = await service.createInitialAdmin({
      email: 'owner@example.com',
      password: PASSWORD
    });

    expect(admin).toMatchObject({ email: 'owner@example.com', role: 'admin' });
    const stored = system!.database
      .prepare('SELECT password_hash, role FROM users WHERE email = ?')
      .get('owner@example.com') as {
      password_hash: string;
      role: string;
    };
    expect(stored.role).toBe('admin');
    expect(stored.password_hash).not.toBe(PASSWORD);
  });

  it('refuses a second bootstrap and leaves exactly one Admin', async () => {
    const service = createAuthService(
      system!.database,
      'integration-test-secret-which-is-at-least-32-chars'
    );
    await service.createInitialAdmin({ email: 'owner@example.com', password: PASSWORD });

    await expect(
      service.createInitialAdmin({ email: 'second@example.com', password: PASSWORD })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ADMIN_ALREADY_PROVISIONED' });
    expect(
      system!.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get()
    ).toEqual({ count: 1 });
  });

  it('allows only one Admin when two bootstrap attempts race', async () => {
    const service = createAuthService(
      system!.database,
      'integration-test-secret-which-is-at-least-32-chars'
    );
    const results = await Promise.allSettled([
      service.createInitialAdmin({ email: 'first@example.com', password: PASSWORD }),
      service.createInitialAdmin({ email: 'second@example.com', password: PASSWORD })
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      system!.database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get()
    ).toEqual({ count: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('scrypt password hashing', () => {
  it('stores a salted, versioned hash rather than the password', async () => {
    const password = 'correct horse battery';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('incorrect horse battery', hash)).toBe(false);
  });

  it('uses a fresh salt for every account with the same password', async () => {
    const first = await hashPassword('correct horse battery');
    const second = await hashPassword('correct horse battery');
    expect(first).not.toBe(second);
    expect(await verifyPassword('correct horse battery', second)).toBe(true);
  });

  it.each(['', 'plaintext', 'scrypt$1$1$1$bad$bad'])(
    'fails closed for malformed stored hash %j',
    async (hash) => {
      await expect(verifyPassword('candidate password', hash)).resolves.toBe(false);
    }
  );
});

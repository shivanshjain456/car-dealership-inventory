import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTestSystem, createTestSystem, type TestSystem } from './helpers.js';

const PASSWORD = 'correct horse battery';
let system: TestSystem | undefined;

beforeEach(() => {
  system = createTestSystem();
});

afterEach(() => {
  clearTestSystem(system);
  system = undefined;
});

describe('authentication API', () => {
  it('reports health without exposing database or configuration details', async () => {
    const response = await request(system!.app).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(JSON.stringify(response.body)).not.toContain('sqlite');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('registers a normalized customer, sets an HttpOnly session cookie, and returns no credentials', async () => {
    const response = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: ' Demo@Example.com ', password: PASSWORD })
      .expect(201);

    expect(response.body.user).toMatchObject({ email: 'demo@example.com', role: 'customer' });
    expect(response.body.user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.headers['set-cookie']?.[0]).toMatch(/motorline_session=/);
    expect(response.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(response.headers['set-cookie']?.[0]).toMatch(/SameSite=Strict/i);
    expect(response.headers['set-cookie']?.[0]).not.toMatch(/Secure/i);

    const cookie = response.headers['set-cookie']?.[0].split(';')[0];
    const currentUser = await request(system!.app)
      .get('/api/auth/me')
      .set('Cookie', cookie!)
      .expect(200);
    expect(currentUser.body.user).toMatchObject({ email: 'demo@example.com', role: 'customer' });
  });

  it('rejects public role assignment and does not create an account', async () => {
    const response = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'admin@example.com', password: PASSWORD, role: 'admin' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(system!.database.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({
      count: 0
    });
  });

  it('rejects duplicate email regardless of letter case', async () => {
    await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'owner@example.com', password: PASSWORD })
      .expect(201);

    const response = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'OWNER@EXAMPLE.COM', password: PASSWORD })
      .expect(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('logs in with normalized email, gives a generic failure, and clears the session on logout', async () => {
    await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'owner@example.com', password: PASSWORD })
      .expect(201);

    const login = await request(system!.app)
      .post('/api/auth/login')
      .send({ email: ' OWNER@EXAMPLE.COM ', password: PASSWORD })
      .expect(200);
    expect(login.body.user).toMatchObject({ email: 'owner@example.com', role: 'customer' });

    const wrongPassword = await request(system!.app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'incorrect password' })
      .expect(401);
    const unknownEmail = await request(system!.app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: PASSWORD })
      .expect(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);

    const logout = await request(system!.app)
      .post('/api/auth/logout')
      .set('Cookie', login.headers['set-cookie']?.[0].split(';')[0] ?? '')
      .expect(204);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/motorline_session=;/);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  it('revokes only the copied session token presented at logout', async () => {
    const registration = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'sessions@example.com', password: PASSWORD })
      .expect(201);
    const firstCookie = registration.headers['set-cookie']?.[0].split(';')[0] ?? '';

    const secondLogin = await request(system!.app)
      .post('/api/auth/login')
      .send({ email: 'sessions@example.com', password: PASSWORD })
      .expect(200);
    const secondCookie = secondLogin.headers['set-cookie']?.[0].split(';')[0] ?? '';

    await request(system!.app).get('/api/auth/me').set('Cookie', firstCookie).expect(200);
    await request(system!.app).post('/api/auth/logout').set('Cookie', firstCookie).expect(204);

    const revoked = await request(system!.app)
      .get('/api/auth/me')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(revoked.body.error.code).toBe('UNAUTHENTICATED');

    await request(system!.app).get('/api/auth/me').set('Cookie', secondCookie).expect(200);
    await request(system!.app).post('/api/auth/logout').expect(204);
  });

  it('accepts bearer sessions and keeps logout idempotent for malformed tokens', async () => {
    const registration = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'bearer@example.com', password: PASSWORD })
      .expect(201);
    const cookie = registration.headers['set-cookie']?.[0].split(';')[0] ?? '';
    const token = cookie.slice(cookie.indexOf('=') + 1);

    await request(system!.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(system!.app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(system!.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(system!.app)
      .post('/api/auth/logout')
      .set('Cookie', 'motorline_session=not-a-jwt')
      .expect(204);
  });

  it('requires authentication for current-user and inventory endpoints', async () => {
    await request(system!.app).get('/api/auth/me').expect(401);
    await request(system!.app).get('/api/vehicles').expect(401);
    await request(system!.app).get('/api/vehicles/search').expect(401);
    await request(system!.app)
      .post('/api/vehicles/00000000-0000-4000-8000-000000000001/purchase')
      .expect(401);
  });

  it('returns 422 for malformed or out-of-policy registration fields', async () => {
    const tooShort = await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'valid@example.com', password: 'short' })
      .expect(422);
    expect(tooShort.body.error.code).toBe('VALIDATION_ERROR');

    await request(system!.app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: PASSWORD })
      .expect(422);
  });

  it('rejects a missing or tampered session token', async () => {
    await request(system!.app)
      .get('/api/auth/me')
      .set('Cookie', 'motorline_session=not-a-jwt')
      .expect(401);
  });

  it('sets the Secure cookie flag in production', async () => {
    const productionSystem = createTestSystem(100, 'production');
    try {
      const response = await request(productionSystem.app)
        .post('/api/auth/register')
        .send({ email: 'secure@example.com', password: PASSWORD })
        .expect(201);
      expect(response.headers['set-cookie']?.[0]).toMatch(/Secure/i);
    } finally {
      productionSystem.close();
    }
  });

  it('limits repeated login attempts', async () => {
    const limitedSystem = createTestSystem(1);
    try {
      await request(limitedSystem.app)
        .post('/api/auth/login')
        .send({ email: 'missing@example.com', password: PASSWORD })
        .expect(401);
      const limited = await request(limitedSystem.app)
        .post('/api/auth/login')
        .send({ email: 'missing@example.com', password: PASSWORD })
        .expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(limited.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    } finally {
      limitedSystem.close();
    }
  });
});

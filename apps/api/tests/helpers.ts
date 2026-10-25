import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import request from 'supertest';
import { createAuthService } from '../src/auth/service.js';
import { createApp } from '../src/app.js';
import { migrateDatabase, openDatabase } from '../src/db/database.js';

export const TEST_JWT_SECRET = 'integration-test-secret-which-is-at-least-32-chars';

export interface TestSystem {
  app: Express;
  database: Database.Database;
  directory: string;
  close(): void;
}

export function createTestSystem(
  authRateLimitMax = 100,
  environment: 'development' | 'test' | 'production' = 'test'
): TestSystem {
  const directory = mkdtempSync(join(tmpdir(), 'motorline-api-'));
  const database = openDatabase(join(directory, 'inventory.sqlite'));
  migrateDatabase(database);
  const app = createApp({
    database,
    jwtSecret: TEST_JWT_SECRET,
    environment,
    authRateLimitMax
  });

  return {
    app,
    database,
    directory,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

export function clearTestSystem(system: TestSystem | undefined): void {
  system?.close();
}

export async function registerCustomer(
  system: TestSystem,
  email = 'customer@example.com',
  password = 'customer-passphrase'
): Promise<string> {
  const response = await request(system.app)
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201);
  return response.headers['set-cookie']?.[0].split(';')[0] ?? '';
}

export async function bootstrapAdminAndLogin(
  system: TestSystem,
  email = 'owner@example.com',
  password = 'local-admin-passphrase'
): Promise<string> {
  const authService = createAuthService(system.database, TEST_JWT_SECRET);
  await authService.createInitialAdmin({ email, password });
  const response = await request(system.app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return response.headers['set-cookie']?.[0].split(';')[0] ?? '';
}

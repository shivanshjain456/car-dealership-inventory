import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrateDatabase, openDatabase } from '../src/db/database.js';
import { TEST_JWT_SECRET } from './helpers.js';

describe('static single-page application hosting', () => {
  let database: Database.Database | undefined;
  let temporaryDirectories: string[] = [];

  function createStaticApplication(): Express {
    const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'motorline-api-'));
    const webDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'motorline-web-'));
    temporaryDirectories = [databaseDirectory, webDirectory];

    fs.mkdirSync(path.join(webDirectory, 'assets'));
    fs.writeFileSync(path.join(webDirectory, 'index.html'), '<!doctype html><title>Motorline test</title>');
    fs.writeFileSync(path.join(webDirectory, 'assets', 'app-abc123.js'), 'console.log("ok");');
    fs.writeFileSync(path.join(webDirectory, 'assets', 'app-abc123.css'), 'body {}');
    fs.writeFileSync(path.join(webDirectory, 'robots.txt'), 'User-agent: *\nAllow: /\n');

    database = openDatabase(path.join(databaseDirectory, 'inventory.sqlite'));
    migrateDatabase(database);
    return createApp({
      database,
      jwtSecret: TEST_JWT_SECRET,
      environment: 'test',
      webDirectory
    });
  }

  afterEach(() => {
    database?.close();
    database = undefined;
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryDirectories = [];
  });

  it('supports HEAD requests for the SPA shell and client routes', async () => {
    const app = createStaticApplication();

    for (const routePath of ['/', '/inventory']) {
      const response = await request(app)
        .head(routePath)
        .expect(200)
        .expect('Content-Type', /text\/html/);
      expect(response.text ?? '').toBe('');
      expect(Number(response.headers['content-length'])).toBeGreaterThan(0);
    }
  });

  it('keeps the HTML shell revalidated while caching hashed assets immutably', async () => {
    const app = createStaticApplication();

    const shell = await request(app).get('/').expect(200);
    expect(shell.headers['cache-control']).toContain('no-cache');

    for (const assetPath of ['/assets/app-abc123.js', '/assets/app-abc123.css']) {
      const asset = await request(app).get(assetPath).expect(200);
      expect(asset.headers['cache-control']).toContain('public');
      expect(asset.headers['cache-control']).toContain('max-age=31536000');
      expect(asset.headers['cache-control']).toContain('immutable');
    }
  });

  it('serves crawler metadata and treats a missing ICO favicon as an empty success', async () => {
    const app = createStaticApplication();

    const robots = await request(app)
      .get('/robots.txt')
      .expect(200)
      .expect('Content-Type', /text\/plain/);
    expect(robots.text).toContain('User-agent: *');

    await request(app).get('/favicon.ico').expect(204);
  });
});

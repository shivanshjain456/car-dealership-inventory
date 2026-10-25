import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { migrateDatabase, openDatabase } from '../src/db/database.js';

let directory: string;
let database: Database.Database | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'motorline-db-'));
});

afterEach(() => {
  database?.close();
  database = undefined;
  rmSync(directory, { recursive: true, force: true });
});

describe('file-backed SQLite database', () => {
  it('creates the database directory and enables foreign keys', () => {
    const file = join(directory, 'nested', 'inventory.sqlite');
    database = openDatabase(file);

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('applies versioned migrations idempotently and creates required tables', () => {
    database = openDatabase(join(directory, 'inventory.sqlite'));
    migrateDatabase(database);
    migrateDatabase(database);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['schema_migrations', 'users', 'vehicles']));
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({
      count: 2
    });
    expect(database.pragma('table_info(vehicles)')).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'version', dflt_value: '1' })])
    );
  });

  it('upgrades a version-one database while preserving its existing inventory', () => {
    database = openDatabase(join(directory, 'inventory.sqlite'));
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    database.exec(
      readFileSync(new URL('../src/db/migrations/001_initial.sql', import.meta.url), 'utf8')
    );
    database
      .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, new Date().toISOString());
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    database
      .prepare(
        `
        INSERT INTO vehicles (id, make, model, category, price_minor, currency, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(id, 'Toyota', 'Corolla', 'Sedan', 2_599_999, 'USD', 3, timestamp, timestamp);

    migrateDatabase(database);

    expect(
      database.prepare('SELECT make, quantity, version FROM vehicles WHERE id = ?').get(id)
    ).toEqual({ make: 'Toyota', quantity: 3, version: 1 });
    expect(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it('enforces role, currency-code format, non-negative price, and stock constraints in SQLite', () => {
    database = openDatabase(join(directory, 'inventory.sqlite'));
    migrateDatabase(database);

    const insertVehicle = database.prepare(`
      INSERT INTO vehicles (id, make, model, category, price_minor, currency, quantity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const timestamp = new Date().toISOString();
    const insertValidVehicle = (id: string, price: number, currency: string, quantity: number) =>
      insertVehicle.run(
        id,
        'Toyota',
        'Corolla',
        'Sedan',
        price,
        currency,
        quantity,
        timestamp,
        timestamp
      );

    expect(() => insertValidVehicle(randomUUID(), 1200, 'USD', -1)).toThrow();
    expect(() => insertValidVehicle(randomUUID(), -1, 'USD', 1)).toThrow();
    expect(() => insertValidVehicle(randomUUID(), 1200, 'US', 1)).toThrow();

    expect(() =>
      database!
        .prepare(
          `
        INSERT INTO users (id, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(randomUUID(), 'admin@example.com', 'hash', 'superadmin', timestamp)
    ).toThrow();
  });

  it('persists records after closing and reopening the database file', () => {
    const file = join(directory, 'inventory.sqlite');
    database = openDatabase(file);
    migrateDatabase(database);
    const persistedId = randomUUID();
    database
      .prepare(
        `
        INSERT INTO vehicles (id, make, model, category, price_minor, currency, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        persistedId,
        'Honda',
        'Civic',
        'Sedan',
        2599900,
        'USD',
        4,
        new Date().toISOString(),
        new Date().toISOString()
      );
    database.close();

    database = openDatabase(file);
    migrateDatabase(database);
    expect(database.prepare('SELECT quantity FROM vehicles WHERE id = ?').get(persistedId)).toEqual(
      { quantity: 4 }
    );
  });

  it('rejects an in-memory database path', () => {
    expect(() => openDatabase(':memory:')).toThrow(/file-backed/i);
  });
});

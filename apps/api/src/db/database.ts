import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS = [
  {
    version: 1,
    path: new URL('./migrations/001_initial.sql', import.meta.url)
  },
  {
    version: 2,
    path: new URL('./migrations/002_vehicle_revision.sql', import.meta.url)
  }
] as const;

export function openDatabase(filename: string): Database.Database {
  if (
    typeof filename !== 'string' ||
    filename.trim() === '' ||
    filename.includes('\0') ||
    filename === ':memory:' ||
    filename.startsWith('file::memory:')
  ) {
    throw new TypeError('A file-backed SQLite database path is required.');
  }

  const absolutePath = resolve(filename);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const database = new Database(absolutePath);
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = FULL');
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function migrateDatabase(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const appliedVersions = new Set(
    (
      database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>
    ).map((row) => row.version)
  );
  const latestKnownVersion = Math.max(...MIGRATIONS.map((migration) => migration.version));
  if ([...appliedVersions].some((version) => version > latestKnownVersion)) {
    throw new Error('Database contains a migration newer than this application supports.');
  }

  const applyMigrations = database.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;
      const sql = readFileSync(fileURLToPath(migration.path), 'utf8');
      database.exec(sql);
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
    }
  });

  applyMigrations.immediate();
}

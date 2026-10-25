import { loadConfig } from '../src/config.js';
import { openDatabase, migrateDatabase } from '../src/db/database.js';
import { loadProjectEnvironment, resolveProjectPath } from '../src/runtime.js';

loadProjectEnvironment();
const config = loadConfig();
const database = openDatabase(resolveProjectPath(config.databasePath));
try {
  migrateDatabase(database);
  console.info('SQLite migrations are up to date.');
} finally {
  database.close();
}

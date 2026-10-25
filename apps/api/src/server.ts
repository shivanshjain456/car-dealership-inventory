import { createServer } from 'node:http';
import { openDatabase } from './db/database.js';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { loadProjectEnvironment, resolveProjectPath, WEB_DIRECTORY } from './runtime.js';

loadProjectEnvironment();
const config = loadConfig();
const database = openDatabase(resolveProjectPath(config.databasePath));
const app = createApp({
  database,
  jwtSecret: config.jwtSecret,
  environment: config.environment,
  authRateLimitMax: config.authRateLimitMax,
  webDirectory: WEB_DIRECTORY
});
const server = createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.info(`Motorline API listening on 0.0.0.0:${config.port} (${config.environment})`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; closing API server.`);
  server.close((error) => {
    if (error) {
      console.error(`Server shutdown failed: ${error.name}`);
      process.exitCode = 1;
    }
    database.close();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

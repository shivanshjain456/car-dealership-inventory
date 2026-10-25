import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(projectRoot, '.env');

if (existsSync(envPath)) {
  console.error('A .env file already exists; setup will not overwrite it.');
  process.exitCode = 1;
} else {
  const secret = randomBytes(48).toString('base64url');
  const contents = [
    'NODE_ENV=development',
    'PORT=3001',
    'DATABASE_PATH=./data/motorline.sqlite',
    `JWT_SECRET=${secret}`,
    'AUTH_RATE_LIMIT_MAX=10',
    'LOG_LEVEL=info',
    ''
  ].join('\n');
  writeFileSync(envPath, contents, { flag: 'wx', mode: 0o600 });
  console.info('Created .env with a random JWT signing secret. Keep it local and uncommitted.');
  console.info(
    'Next: npm run db:migrate, then provision your first Admin with npm run admin:create.'
  );
}

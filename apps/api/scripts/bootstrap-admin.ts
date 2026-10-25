import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { registerSchema } from '@motorline/contracts';
import { loadConfig } from '../src/config.js';
import { createAuthService } from '../src/auth/service.js';
import { openDatabase, migrateDatabase } from '../src/db/database.js';
import { loadProjectEnvironment, resolveProjectPath } from '../src/runtime.js';

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(
        new Error(
          'Admin bootstrap requires an interactive terminal so the password is not exposed in command arguments.'
        )
      );
      return;
    }

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';

    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Admin bootstrap cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          const characters = Array.from(value);
          characters.pop();
          value = characters.join('');
          stdout.write('\b \b');
          continue;
        }
        if (character >= ' ') {
          value += character;
          stdout.write('•');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  loadProjectEnvironment();
  const config = loadConfig();
  const database = openDatabase(resolveProjectPath(config.databasePath));
  try {
    migrateDatabase(database);
    const prompt = createInterface({ input: stdin, output: stdout });
    const email = await prompt.question('Admin email: ');
    prompt.close();
    const password = await readHidden('Admin password (hidden): ');
    const input = registerSchema.parse({ email, password });
    const admin = await createAuthService(database, config.jwtSecret).createInitialAdmin(input);
    console.info(`Created the initial Admin account for ${admin.email}.`);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin bootstrap failed.');
  process.exitCode = 1;
});

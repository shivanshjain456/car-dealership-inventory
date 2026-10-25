import { z } from 'zod';

const runtimeConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_PATH: z.string().min(1).default('./data/motorline.sqlite'),
    JWT_SECRET: z.string().min(32),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info')
  })
  .superRefine((config, context) => {
    if (/replace-with|change-me|your-secret/i.test(config.JWT_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'Replace the example signing secret with a generated secret before starting the API.'
      });
    }
  });

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  port: number;
  databasePath: string;
  jwtSecret: string;
  authRateLimitMax: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = runtimeConfigSchema.parse(environment);
  return {
    environment: parsed.NODE_ENV,
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    jwtSecret: parsed.JWT_SECRET,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    logLevel: parsed.LOG_LEVEL
  };
}

import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type Response } from 'express';
import helmet from 'helmet';
import type Database from 'better-sqlite3';
import { createAuthService } from './auth/service.js';
import { createAuthRouter } from './auth/routes.js';
import { HttpError } from './errors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { migrateDatabase } from './db/database.js';
import { createVehicleRouter } from './vehicles/routes.js';

const HASHED_STATIC_ASSET = /-[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

function setStaticCacheHeaders(response: Response, filePath: string): void {
  const filename = basename(filePath);
  if (filename === 'index.html') {
    response.setHeader('Cache-Control', 'no-cache');
  } else if (HASHED_STATIC_ASSET.test(filename)) {
    // Vite asset names contain a content hash, so their bytes can be cached forever.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

export interface AppDependencies {
  database: Database.Database;
  jwtSecret: string;
  environment?: 'development' | 'test' | 'production';
  authRateLimitMax?: number;
  webDirectory?: string;
}

export function createApp(dependencies: AppDependencies): Express {
  if (Buffer.byteLength(dependencies.jwtSecret, 'utf8') < 32) {
    throw new TypeError('JWT signing secret must contain at least 32 bytes.');
  }

  migrateDatabase(dependencies.database);
  const environment = dependencies.environment ?? 'development';
  const authRateLimitMax = dependencies.authRateLimitMax ?? 10;
  const authService = createAuthService(dependencies.database, dependencies.jwtSecret);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', environment === 'production' ? 1 : false);
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.use(
    '/api/auth',
    createAuthRouter({
      authService,
      authRateLimitMax,
      secureCookies: environment === 'production'
    })
  );
  app.use('/api/vehicles', createVehicleRouter(dependencies.database, authService));

  app.use('/api', (_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'API route was not found.'));
  });

  const webDirectory = dependencies.webDirectory ? resolve(dependencies.webDirectory) : undefined;
  if (webDirectory && existsSync(webDirectory)) {
    app.get('/favicon.ico', (_request, response, next) => {
      if (existsSync(join(webDirectory, 'favicon.ico'))) {
        next();
        return;
      }
      // Browsers request this legacy URL even when the SVG application icon is declared.
      response.status(204).end();
    });
    app.use(
      express.static(webDirectory, {
        index: false,
        fallthrough: true,
        setHeaders: setStaticCacheHeaders
      })
    );
    app.use((request, response, next) => {
      if (
        !['GET', 'HEAD'].includes(request.method) ||
        request.path.startsWith('/api') ||
        /\.[^/]+$/.test(request.path)
      ) {
        next(new HttpError(404, 'NOT_FOUND', 'Resource was not found.'));
        return;
      }
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(join(webDirectory, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  } else {
    app.use((_request, _response, next) => {
      next(new HttpError(404, 'NOT_FOUND', 'Resource was not found.'));
    });
  }

  app.use(errorHandler);
  return app;
}

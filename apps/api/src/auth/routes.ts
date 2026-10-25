import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput
} from '@motorline/contracts';
import type { AuthService } from './service.js';
import {
  createAuthenticate,
  getAuthenticatedUser,
  SESSION_COOKIE_NAME
} from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';

const SESSION_TTL_MS = 60 * 60 * 1_000;

export interface AuthRouterOptions {
  authService: AuthService;
  authRateLimitMax: number;
  secureCookies: boolean;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const authenticate = createAuthenticate(options.authService);
  const authenticationRateLimit = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: options.authRateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      const requestId = response.locals.requestId as string;
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Try again later.'
        },
        requestId
      });
    }
  });

  const cookieOptions = {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: 'strict' as const,
    path: '/api',
    maxAge: SESSION_TTL_MS
  };

  router.post(
    '/register',
    authenticationRateLimit,
    validateBody<RegisterInput>(registerSchema),
    async (request, response, next) => {
      try {
        const result = await options.authService.register(request.body as RegisterInput);
        response.cookie(SESSION_COOKIE_NAME, result.token, cookieOptions);
        response.status(201).json({ user: result.user });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/login',
    authenticationRateLimit,
    validateBody<LoginInput>(loginSchema),
    async (request, response, next) => {
      try {
        const result = await options.authService.login(request.body as LoginInput);
        response.cookie(SESSION_COOKIE_NAME, result.token, cookieOptions);
        response.status(200).json({ user: result.user });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post('/logout', (_request, response) => {
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: 'strict',
      path: '/api'
    });
    response.status(204).end();
  });

  router.get('/me', authenticate, (_request, response) => {
    response.status(200).json({ user: getAuthenticatedUser(response) });
  });

  return router;
}

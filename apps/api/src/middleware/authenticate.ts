import type { RequestHandler } from 'express';
import type { UserDto } from '@motorline/contracts';
import type { AuthService } from '../auth/service.js';
import { HttpError } from '../errors.js';

export const SESSION_COOKIE_NAME = 'motorline_session';

function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1];
}

export function createAuthenticate(authService: AuthService): RequestHandler {
  return async (request, response, next) => {
    const token =
      request.cookies?.[SESSION_COOKIE_NAME] || bearerToken(request.get('authorization'));
    if (!token) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }

    try {
      const user = await authService.getSessionUser(token);
      response.locals.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function getAuthenticatedUser(response: { locals: Record<string, unknown> }): UserDto {
  const user = response.locals.user as UserDto | undefined;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return user;
}

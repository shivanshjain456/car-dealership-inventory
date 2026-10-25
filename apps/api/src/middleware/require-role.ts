import type { RequestHandler } from 'express';
import type { UserRole } from '@motorline/contracts';
import { getAuthenticatedUser } from './authenticate.js';
import { HttpError } from '../errors.js';

export function requireRole(role: UserRole): RequestHandler {
  return (_request, response, next) => {
    try {
      if (getAuthenticatedUser(response).role !== role) {
        throw new HttpError(403, 'FORBIDDEN', 'This action is not permitted for this account.');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

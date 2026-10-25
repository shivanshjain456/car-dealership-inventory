import { raw, Router, type Request, type Response } from 'express';
import {
  restockSchema,
  searchQuerySchema,
  vehicleInputSchema,
  type SearchQuery,
  type VehicleInput
} from '@motorline/contracts';
import type { AuthService } from '../auth/service.js';
import { HttpError } from '../errors.js';
import { createAuthenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/require-role.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { createVehicleRepository } from './repository.js';

function vehicleId(request: Request): string {
  const value = request.params.id;
  return typeof value === 'string' ? value : (value?.[0] ?? '');
}

function expectedVehicleVersion(request: Request): number {
  const header = request.get('If-Match');
  if (header === undefined) {
    throw new HttpError(
      428,
      'PRECONDITION_REQUIRED',
      'An If-Match header with the vehicle version is required for this operation.'
    );
  }

  const match = /^"([1-9]\d*)"$/.exec(header.trim());
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) {
    throw new HttpError(
      400,
      'INVALID_IF_MATCH',
      'If-Match must contain one quoted, positive integer vehicle version, such as "1".'
    );
  }
  return version;
}

function setVehicleEtag(response: Response, version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

export function createVehicleRouter(
  database: Parameters<typeof createVehicleRepository>[0],
  authService: AuthService
): Router {
  const router = Router();
  const repository = createVehicleRepository(database);
  const authenticate = createAuthenticate(authService);
  const requireAdmin = requireRole('admin');

  router.use(authenticate);

  router.get('/search', validateQuery(searchQuerySchema), (_request, response, next) => {
    try {
      response.status(200).json(repository.list(response.locals.validatedQuery as SearchQuery));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', validateQuery(searchQuerySchema), (_request, response, next) => {
    try {
      response.status(200).json(repository.list(response.locals.validatedQuery as SearchQuery));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireAdmin, validateBody(vehicleInputSchema), (request, response, next) => {
    try {
      const vehicle = repository.create(request.body as VehicleInput);
      setVehicleEtag(response, vehicle.version);
      response.status(201).json(vehicle);
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', requireAdmin, validateBody(vehicleInputSchema), (request, response, next) => {
    try {
      const expectedVersion = expectedVehicleVersion(request);
      const vehicle = repository.update(
        vehicleId(request),
        request.body as VehicleInput,
        expectedVersion
      );
      setVehicleEtag(response, vehicle.version);
      response.status(200).json(vehicle);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', requireAdmin, (request, response, next) => {
    try {
      const expectedVersion = expectedVehicleVersion(request);
      repository.hardDelete(vehicleId(request), expectedVersion);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:id/purchase',
    raw({ type: () => true, limit: '32kb' }),
    (request, response, next) => {
      const body = request.body as unknown;
      const hasBody = body !== undefined && (!Buffer.isBuffer(body) || body.byteLength > 0);
      if (hasBody) {
        next(new HttpError(400, 'UNEXPECTED_BODY', 'A purchase request must not include a body.'));
        return;
      }

      try {
        response.status(200).json(repository.purchaseOne(vehicleId(request)));
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:id/restock',
    requireAdmin,
    validateBody(restockSchema),
    (request, response, next) => {
      try {
        response
          .status(200)
          .json(
            repository.restock(vehicleId(request), (request.body as { quantity: number }).quantity)
          );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  fromMinorUnits,
  toMinorUnits,
  type SearchQuery,
  type VehicleDto,
  type VehicleInput,
  vehicleDtoSchema,
  vehiclePageSchema,
  type VehiclePage
} from '@motorline/contracts';
import { HttpError } from '../errors.js';

const MAX_SAFE_QUANTITY = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_VERSION = Number.MAX_SAFE_INTEGER;

interface VehicleRow {
  id: string;
  make: string;
  model: string;
  category: string;
  price_minor: number;
  currency: string;
  quantity: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleRepository {
  create(input: VehicleInput): VehicleDto;
  list(query: SearchQuery): VehiclePage;
  update(id: string, input: VehicleInput, expectedVersion: number): VehicleDto;
  hardDelete(id: string, expectedVersion: number): void;
  purchaseOne(id: string): VehicleDto;
  restock(id: string, quantity: number): VehicleDto;
}

const SELECT_COLUMNS = `
  id, make, model, category, price_minor, currency, quantity, version, created_at, updated_at
`;

function toDto(row: VehicleRow): VehicleDto {
  return vehicleDtoSchema.parse({
    id: row.id,
    make: row.make,
    model: row.model,
    category: row.category,
    price: { amount: fromMinorUnits(row.price_minor, row.currency), currency: row.currency },
    quantity: row.quantity,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

const UNICODE_LOWER_FUNCTION = 'motorline_unicode_lower';

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}

// SQLite's built-in LIKE/NOCASE only folds ASCII. Normalize both sides with
// JavaScript's Unicode-aware compatibility normalization and lowercasing.
function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function searchPattern(value: string): string {
  return `%${escapeLike(normalizeSearchText(value))}%`;
}

export function createVehicleRepository(database: Database.Database): VehicleRepository {
  database.function(UNICODE_LOWER_FUNCTION, { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? normalizeSearchText(value) : value
  );
  function findById(id: string): VehicleRow | undefined {
    return database.prepare(`SELECT ${SELECT_COLUMNS} FROM vehicles WHERE id = ?`).get(id) as
      VehicleRow | undefined;
  }

  function requireById(id: string): VehicleDto {
    const row = findById(id);
    if (!row) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Vehicle was not found.');
    return toDto(row);
  }

  function priceMinor(input: VehicleInput): number {
    return toMinorUnits(input.price.amount, input.price.currency);
  }

  function list(query: SearchQuery): VehiclePage {
    const filters: string[] = [];
    const parameters: Array<string | number> = [];
    const partial = (column: 'make' | 'model' | 'category', value: string) => {
      filters.push(`${UNICODE_LOWER_FUNCTION}(${column}) LIKE ? ESCAPE '!'`);
      parameters.push(searchPattern(value));
    };

    if (query.q) {
      filters.push(
        `(${UNICODE_LOWER_FUNCTION}(make) LIKE ? ESCAPE '!' OR ${UNICODE_LOWER_FUNCTION}(model) LIKE ? ESCAPE '!' OR ${UNICODE_LOWER_FUNCTION}(category) LIKE ? ESCAPE '!')`
      );
      const pattern = searchPattern(query.q);
      parameters.push(pattern, pattern, pattern);
    }
    if (query.make) partial('make', query.make);
    if (query.model) partial('model', query.model);
    if (query.category) partial('category', query.category);
    if (query.currency) {
      filters.push('currency = ?');
      parameters.push(query.currency);
    }
    if (query.minPrice !== undefined) {
      filters.push('price_minor >= ?');
      parameters.push(toMinorUnits(query.minPrice, query.currency!));
    }
    if (query.maxPrice !== undefined) {
      filters.push('price_minor <= ?');
      parameters.push(toMinorUnits(query.maxPrice, query.currency!));
    }

    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    const total = (
      database.prepare(`SELECT COUNT(*) AS count FROM vehicles${where}`).get(...parameters) as {
        count: number;
      }
    ).count;
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;
    const rows = database
      .prepare(
        `
        SELECT ${SELECT_COLUMNS}
        FROM vehicles${where}
        ORDER BY ${UNICODE_LOWER_FUNCTION}(make) ASC, ${UNICODE_LOWER_FUNCTION}(model) ASC, id ASC
        LIMIT ? OFFSET ?
      `
      )
      .all(...parameters, limit, offset) as VehicleRow[];

    return vehiclePageSchema.parse({
      items: rows.map(toDto),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    });
  }

  return {
    create(input) {
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      database
        .prepare(
          `
          INSERT INTO vehicles (id, make, model, category, price_minor, currency, quantity, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          id,
          input.make,
          input.model,
          input.category,
          priceMinor(input),
          input.price.currency,
          input.quantity,
          timestamp,
          timestamp
        );
      return requireById(id);
    },

    list,

    update(id, input, expectedVersion) {
      const result = database
        .prepare(
          `
          UPDATE vehicles
          SET make = ?, model = ?, category = ?, price_minor = ?, currency = ?, quantity = ?,
              version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND version < ?
        `
        )
        .run(
          input.make,
          input.model,
          input.category,
          priceMinor(input),
          input.price.currency,
          input.quantity,
          new Date().toISOString(),
          id,
          expectedVersion,
          MAX_SAFE_VERSION
        );
      if (result.changes === 0) {
        const current = findById(id);
        if (!current) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Vehicle was not found.');
        if (current.version !== expectedVersion) {
          throw new HttpError(
            412,
            'STALE_WRITE',
            'This vehicle changed after it was loaded. Refresh inventory and review the latest version before saving.'
          );
        }
        throw new HttpError(
          409,
          'REVISION_LIMIT',
          'The vehicle revision limit has been reached; no update was made.'
        );
      }
      return requireById(id);
    },

    hardDelete(id, expectedVersion) {
      const result = database
        .prepare('DELETE FROM vehicles WHERE id = ? AND version = ?')
        .run(id, expectedVersion);
      if (result.changes === 1) return;

      if (!findById(id)) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Vehicle was not found.');
      throw new HttpError(
        412,
        'STALE_WRITE',
        'This vehicle changed after it was loaded. Refresh inventory and review the latest version before deleting.'
      );
    },

    purchaseOne(id) {
      const result = database
        .prepare(
          `
          UPDATE vehicles
          SET quantity = quantity - 1, version = version + 1, updated_at = ?
          WHERE id = ? AND quantity > 0 AND version < ?
        `
        )
        .run(new Date().toISOString(), id, MAX_SAFE_VERSION);
      if (result.changes === 1) return requireById(id);

      const current = findById(id);
      if (!current) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Vehicle was not found.');
      if (current.version >= MAX_SAFE_VERSION) {
        throw new HttpError(
          409,
          'REVISION_LIMIT',
          'The vehicle revision limit has been reached; stock was not changed.'
        );
      }
      throw new HttpError(409, 'OUT_OF_STOCK', 'This vehicle is currently out of stock.');
    },

    restock(id, quantity) {
      const result = database
        .prepare(
          `
          UPDATE vehicles
          SET quantity = quantity + ?, version = version + 1, updated_at = ?
          WHERE id = ? AND quantity <= ? AND version < ?
        `
        )
        .run(
          quantity,
          new Date().toISOString(),
          id,
          MAX_SAFE_QUANTITY - quantity,
          MAX_SAFE_VERSION
        );
      if (result.changes === 1) return requireById(id);

      const current = findById(id);
      if (!current) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Vehicle was not found.');
      if (current.version >= MAX_SAFE_VERSION) {
        throw new HttpError(
          409,
          'REVISION_LIMIT',
          'The vehicle revision limit has been reached; stock was not changed.'
        );
      }
      throw new HttpError(
        409,
        'QUANTITY_LIMIT',
        'The requested restock exceeds the supported quantity limit.'
      );
    }
  };
}

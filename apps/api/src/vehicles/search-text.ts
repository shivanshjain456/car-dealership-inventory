import type Database from 'better-sqlite3';

export const UNICODE_LOWER_FUNCTION = 'motorline_unicode_lower';

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}

// SQLite's built-in LIKE/NOCASE only folds ASCII. Normalize both sides with
// JavaScript's Unicode-aware compatibility normalization and lowercasing.
export function normalizeVehicleSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function vehicleSearchPattern(value: string): string {
  return `%${escapeLike(normalizeVehicleSearchText(value))}%`;
}

export function registerVehicleSearchFunctions(database: Database.Database): void {
  database.function(UNICODE_LOWER_FUNCTION, { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? normalizeVehicleSearchText(value) : value
  );
}

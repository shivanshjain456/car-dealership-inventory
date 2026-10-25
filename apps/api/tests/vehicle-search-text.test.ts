import { describe, expect, it } from 'vitest';
import {
  normalizeVehicleSearchText,
  vehicleSearchPattern
} from '../src/vehicles/search-text.js';

describe('vehicle search text normalization', () => {
  it('folds Unicode case and compatibility characters', () => {
    expect(normalizeVehicleSearchText('ŠKODA')).toBe('škoda');
    expect(normalizeVehicleSearchText('ＳＫＯＤＡ')).toBe('skoda');
  });

  it('escapes SQL wildcard and escape characters after normalization', () => {
    expect(vehicleSearchPattern('100%_!')).toBe('%100!%!_!!%');
  });
});

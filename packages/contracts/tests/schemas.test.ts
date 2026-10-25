import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  registerSchema,
  restockSchema,
  searchQuerySchema,
  vehicleDtoSchema,
  vehicleInputSchema
} from '../src/schemas.js';

const validVehicle = {
  make: '  Toyota ',
  model: '  Corolla Cross ',
  category: '  SUV ',
  price: { amount: '25999.99', currency: 'USD' },
  quantity: 0
};

describe('authentication request schemas', () => {
  it('normalizes email and accepts a project-policy password', () => {
    expect(
      registerSchema.parse({ email: '  Demo@Example.com ', password: 'correct horse battery' })
    ).toEqual({
      email: 'demo@example.com',
      password: 'correct horse battery'
    });
  });

  it('rejects role fields and other mass-assignment properties', () => {
    expect(() =>
      registerSchema.parse({
        email: 'demo@example.com',
        password: 'correct horse battery',
        role: 'admin'
      })
    ).toThrow();
  });

  it('rejects passwords outside the documented length limits', () => {
    expect(() => registerSchema.parse({ email: 'demo@example.com', password: 'short' })).toThrow();
    expect(() =>
      registerSchema.parse({ email: 'demo@example.com', password: 'x'.repeat(129) })
    ).toThrow();
  });

  it('requires valid email and password fields for login', () => {
    expect(
      loginSchema.parse({ email: 'OWNER@EXAMPLE.COM', password: 'correct horse battery' })
    ).toEqual({
      email: 'owner@example.com',
      password: 'correct horse battery'
    });
    expect(() =>
      loginSchema.parse({ email: 'not-an-email', password: 'correct horse battery' })
    ).toThrow();
  });
});

describe('vehicle request schemas', () => {
  it('trims vehicle text, normalizes currency, and permits zero stock', () => {
    expect(vehicleInputSchema.parse(validVehicle)).toEqual({
      make: 'Toyota',
      model: 'Corolla Cross',
      category: 'SUV',
      price: { amount: '25999.99', currency: 'USD' },
      quantity: 0
    });
  });

  it('rejects unknown fields instead of silently accepting forged identifiers or roles', () => {
    expect(() => vehicleInputSchema.parse({ ...validVehicle, id: 'attacker-chosen-id' })).toThrow();
  });

  it('rejects invalid stock, money precision, and unsupported currency codes', () => {
    expect(() => vehicleInputSchema.parse({ ...validVehicle, quantity: -1 })).toThrow();
    expect(() => vehicleInputSchema.parse({ ...validVehicle, quantity: 1.5 })).toThrow();
    expect(() =>
      vehicleInputSchema.parse({ ...validVehicle, price: { amount: '1.001', currency: 'USD' } })
    ).toThrow();
    expect(() =>
      vehicleInputSchema.parse({ ...validVehicle, price: { amount: '1.00', currency: 'ZZZ' } })
    ).toThrow();
  });
});

describe('vehicle response schema', () => {
  const validVehicleDto = {
    id: '33333333-3333-4333-8333-333333333333',
    make: 'Toyota',
    model: 'Corolla Cross',
    category: 'SUV',
    price: { amount: '25999.99', currency: 'USD' },
    quantity: 4,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z'
  };

  it('requires a positive whole-number revision for concurrency preconditions', () => {
    expect(() => vehicleDtoSchema.parse(validVehicleDto)).toThrow();
    expect(vehicleDtoSchema.parse({ ...validVehicleDto, version: 1 })).toMatchObject({
      version: 1
    });
    expect(() => vehicleDtoSchema.parse({ ...validVehicleDto, version: 0 })).toThrow();
    expect(() => vehicleDtoSchema.parse({ ...validVehicleDto, version: 1.5 })).toThrow();
  });
});

describe('vehicle search query schema', () => {
  it('applies pagination defaults and trims text filters', () => {
    expect(searchQuerySchema.parse({ make: ' Toyota ' })).toEqual({
      make: 'Toyota',
      page: 1,
      limit: 20
    });
  });

  it('requires a currency when either price bound is supplied', () => {
    expect(() => searchQuerySchema.parse({ minPrice: '10000' })).toThrow();
    expect(() => searchQuerySchema.parse({ maxPrice: '50000', currency: 'USD' })).not.toThrow();
  });

  it('rejects a reversed range and precision that does not match the currency', () => {
    expect(() =>
      searchQuerySchema.parse({ minPrice: '50000', maxPrice: '10000', currency: 'USD' })
    ).toThrow();
    expect(() => searchQuerySchema.parse({ minPrice: '1.001', currency: 'USD' })).toThrow();
  });

  it('rejects excessive pagination and unknown query parameters', () => {
    expect(() => searchQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => searchQuerySchema.parse({ page: '0' })).toThrow();
    expect(() => searchQuerySchema.parse({ page: '1000001' })).toThrow();
    expect(() => searchQuerySchema.parse({ sort: 'price' })).toThrow();
  });
});

describe('restock request schema', () => {
  it('accepts only a positive whole-number quantity', () => {
    expect(restockSchema.parse({ quantity: 8 })).toEqual({ quantity: 8 });
    expect(() => restockSchema.parse({ quantity: 0 })).toThrow();
    expect(() => restockSchema.parse({ quantity: 1.25 })).toThrow();
  });
});

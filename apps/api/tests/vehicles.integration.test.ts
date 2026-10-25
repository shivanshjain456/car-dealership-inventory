import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapAdminAndLogin,
  clearTestSystem,
  createTestSystem,
  registerCustomer,
  type TestSystem
} from './helpers.js';

let system: TestSystem | undefined;
const vehicle = {
  make: 'Toyota',
  model: 'Corolla Cross',
  category: 'SUV',
  price: { amount: '25999.99', currency: 'USD' },
  quantity: 4
};

beforeEach(() => {
  system = createTestSystem();
});

afterEach(() => {
  clearTestSystem(system);
  system = undefined;
});

async function createVehicleAsAdmin(cookie: string, body = vehicle) {
  return request(system!.app).post('/api/vehicles').set('Cookie', cookie).send(body).expect(201);
}

describe('vehicle inventory API', () => {
  it('allows Admin creation, returns a generated ID, and rejects customer mutations', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie);

    expect(created.body).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      ...vehicle,
      version: 1
    });
    expect(created.headers.etag).toBe('"1"');
    expect(created.headers['cache-control']).toContain('no-transform');
    expect(created.body.createdAt).toEqual(expect.any(String));
    expect(created.body.updatedAt).toEqual(expect.any(String));
    expect(
      system!.database
        .prepare('SELECT price_minor, currency FROM vehicles WHERE id = ?')
        .get(created.body.id)
    ).toEqual({ price_minor: 2_599_999, currency: 'USD' });

    await request(system!.app)
      .post('/api/vehicles')
      .set('Cookie', customerCookie)
      .send(vehicle)
      .expect(403);
  });

  it('rejects forged vehicle identifiers, invalid currency amounts, and negative stock', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    await request(system!.app)
      .post('/api/vehicles')
      .set('Cookie', adminCookie)
      .send({ ...vehicle, id: 'attacker-id' })
      .expect(422);
    await request(system!.app)
      .post('/api/vehicles')
      .set('Cookie', adminCookie)
      .send({ ...vehicle, price: { amount: '1.001', currency: 'USD' } })
      .expect(422);
    await request(system!.app)
      .post('/api/vehicles')
      .set('Cookie', adminCookie)
      .send({ ...vehicle, quantity: -1 })
      .expect(422);
  });

  it('requires Admin for update and performs a full replacement', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie);
    const replacement = {
      make: 'Toyota',
      model: 'RAV4 Hybrid',
      category: 'SUV',
      price: { amount: '39950.00', currency: 'USD' },
      quantity: 7
    };

    await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', customerCookie)
      .send(replacement)
      .expect(403);

    const updated = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .send(replacement)
      .expect(200);
    expect(updated.body).toMatchObject({ ...replacement, version: 2 });
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.headers['cache-control']).toContain('no-transform');

    await request(system!.app)
      .put('/api/vehicles/00000000-0000-4000-8000-000000000001')
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .send(replacement)
      .expect(404);
  });

  it('requires explicit version preconditions before Admin update or delete', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const created = await createVehicleAsAdmin(adminCookie);
    const replacement = { ...vehicle, model: 'RAV4 Hybrid' };

    const missingUpdate = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .send(replacement)
      .expect(428);
    expect(missingUpdate.body.error.code).toBe('PRECONDITION_REQUIRED');

    const invalidUpdate = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '*')
      .send(replacement)
      .expect(400);
    expect(invalidUpdate.body.error.code).toBe('INVALID_IF_MATCH');

    const missingDelete = await request(system!.app)
      .delete(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .expect(428);
    expect(missingDelete.body.error.code).toBe('PRECONDITION_REQUIRED');
    expect(system!.database.prepare('SELECT COUNT(*) AS count FROM vehicles').get()).toEqual({
      count: 1
    });
  });

  it('rejects stale Admin updates and deletes without overwriting newer inventory', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const created = await createVehicleAsAdmin(adminCookie);
    const currentUpdate = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .send({ ...vehicle, model: 'RAV4 Hybrid' })
      .expect(200);
    expect(currentUpdate.body.version).toBe(2);

    const staleUpdate = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .send({ ...vehicle, model: 'Stale overwrite' })
      .expect(412);
    expect(staleUpdate.body.error.code).toBe('STALE_WRITE');

    const staleDelete = await request(system!.app)
      .delete(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .expect(412);
    expect(staleDelete.body.error.code).toBe('STALE_WRITE');

    const persisted = await request(system!.app)
      .get('/api/vehicles')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(persisted.body.items[0]).toMatchObject({ model: 'RAV4 Hybrid', version: 2 });

    await request(system!.app)
      .delete(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"2"')
      .expect(204);
  });

  it('rejects an Admin edit based on stock that a customer has since purchased', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie, { ...vehicle, quantity: 2 });

    await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/purchase`)
      .set('Cookie', customerCookie)
      .expect(200);

    const staleUpdate = await request(system!.app)
      .put(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .send({ ...vehicle, quantity: 2 })
      .expect(412);
    expect(staleUpdate.body.error.code).toBe('STALE_WRITE');

    const current = await request(system!.app)
      .get('/api/vehicles')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(current.body.items[0]).toMatchObject({ quantity: 1, version: 2 });
  });

  it('hard-deletes only for Admin and returns no response body', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie);

    await request(system!.app)
      .delete(`/api/vehicles/${created.body.id}`)
      .set('Cookie', customerCookie)
      .expect(403);
    const deleted = await request(system!.app)
      .delete(`/api/vehicles/${created.body.id}`)
      .set('Cookie', adminCookie)
      .set('If-Match', '"1"')
      .expect(204);
    expect(deleted.text).toBe('');
    expect(system!.database.prepare('SELECT COUNT(*) AS count FROM vehicles').get()).toEqual({
      count: 0
    });
  });

  it('requires Admin for restock and accepts only a positive whole-number quantity', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie);

    await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/restock`)
      .set('Cookie', customerCookie)
      .send({ quantity: 2 })
      .expect(403);
    await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/restock`)
      .set('Cookie', adminCookie)
      .send({ quantity: 0 })
      .expect(422);

    const restocked = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/restock`)
      .set('Cookie', adminCookie)
      .send({ quantity: 3 })
      .expect(200);
    expect(restocked.body).toMatchObject({ quantity: 7, version: 2 });
  });

  it('prevents restock from overflowing the supported safe-integer quantity', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const created = await createVehicleAsAdmin(adminCookie, {
      ...vehicle,
      quantity: Number.MAX_SAFE_INTEGER - 1
    });

    const response = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/restock`)
      .set('Cookie', adminCookie)
      .send({ quantity: 2 })
      .expect(409);
    expect(response.body.error.code).toBe('QUANTITY_LIMIT');
    expect(
      system!.database.prepare('SELECT quantity FROM vehicles WHERE id = ?').get(created.body.id)
    ).toEqual({ quantity: Number.MAX_SAFE_INTEGER - 1 });
  });

  it('lists vehicles including zero stock and returns stable pagination', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    await createVehicleAsAdmin(adminCookie, { ...vehicle, quantity: 0 });
    await createVehicleAsAdmin(adminCookie, { ...vehicle, model: 'GR86', quantity: 2 });
    await createVehicleAsAdmin(adminCookie, {
      ...vehicle,
      make: 'Ford',
      model: 'Bronco',
      quantity: 1
    });

    const firstPage = await request(system!.app)
      .get('/api/vehicles')
      .query({ limit: 2 })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(firstPage.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.items.some((item: { quantity: number }) => item.quantity === 0)).toBe(
      true
    );

    const secondPage = await request(system!.app)
      .get('/api/vehicles')
      .query({ page: 2, limit: 2 })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.page).toBe(2);
  });

  it('searches case-insensitively across make, model, and category', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    await createVehicleAsAdmin(adminCookie, vehicle);
    await createVehicleAsAdmin(adminCookie, {
      ...vehicle,
      make: 'Ford',
      model: 'Explorer',
      category: 'SUV'
    });
    await createVehicleAsAdmin(adminCookie, {
      ...vehicle,
      make: 'Honda',
      model: 'Civic',
      category: 'Sedan'
    });

    const response = await request(system!.app)
      .get('/api/vehicles/search')
      .query({ make: 'toy', category: 'suv' })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ make: 'Toyota', category: 'SUV' });

    const querySearch = await request(system!.app)
      .get('/api/vehicles/search')
      .query({ q: 'civ' })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(querySearch.body.items[0]).toMatchObject({ model: 'Civic' });
  });

  it('searches Unicode text case-insensitively across make, model, and category', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie, {
      ...vehicle,
      make: 'ŠkodaQA',
      model: 'Ünicode',
      category: 'Électrique'
    });

    for (const query of [
      { make: 'ško' },
      { model: 'ünic' },
      { category: 'élect' },
      { q: 'ŠKODA' }
    ]) {
      const response = await request(system!.app)
        .get('/api/vehicles/search')
        .query(query)
        .set('Cookie', customerCookie)
        .expect(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(created.body.id);
    }
  });

  it('requires a currency for price ranges and never compares across currencies', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    await createVehicleAsAdmin(adminCookie, vehicle);
    await createVehicleAsAdmin(adminCookie, {
      make: 'Tata',
      model: 'Nexon',
      category: 'SUV',
      price: { amount: '25999.99', currency: 'EUR' },
      quantity: 2
    });

    await request(system!.app)
      .get('/api/vehicles/search')
      .query({ minPrice: '25000' })
      .set('Cookie', customerCookie)
      .expect(422);

    const usdResults = await request(system!.app)
      .get('/api/vehicles/search')
      .query({ minPrice: '25000.00', maxPrice: '30000.00', currency: 'USD' })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(usdResults.body.total).toBe(1);
    expect(usdResults.body.items[0].price.currency).toBe('USD');

    const reversedRange = await request(system!.app)
      .get('/api/vehicles/search')
      .query({ minPrice: '30000', maxPrice: '25000', currency: 'USD' })
      .set('Cookie', customerCookie)
      .expect(422);
    expect(reversedRange.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    await createVehicleAsAdmin(adminCookie, { ...vehicle, make: 'A%uto', model: 'One' });
    await createVehicleAsAdmin(adminCookie, { ...vehicle, make: 'Auto', model: 'Two' });

    const response = await request(system!.app)
      .get('/api/vehicles/search')
      .query({ make: '%' })
      .set('Cookie', customerCookie)
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].make).toBe('A%uto');
  });

  it('rejects any purchase body without changing stock', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie, { ...vehicle, quantity: 4 });

    const invalidBodies = [
      { contentType: 'application/json', body: '[]' },
      { contentType: 'application/json', body: '{}' },
      { contentType: 'application/json', body: '{"quantity":2}' },
      { contentType: 'text/plain', body: 'not a purchase payload' }
    ];
    for (const body of invalidBodies) {
      const response = await request(system!.app)
        .post(`/api/vehicles/${created.body.id}/purchase`)
        .set('Cookie', customerCookie)
        .type(body.contentType)
        .send(body.body)
        .expect(400);
      expect(response.body.error.code).toBe('UNEXPECTED_BODY');
    }

    const jsonPrimitive = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/purchase`)
      .set('Cookie', customerCookie)
      .type('application/json')
      .send('null')
      .expect(400);
    expect(jsonPrimitive.body.error.code).toBe('MALFORMED_JSON');

    expect(
      system!.database.prepare('SELECT quantity FROM vehicles WHERE id = ?').get(created.body.id)
    ).toEqual({ quantity: 4 });

    const noBodyPurchase = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/purchase`)
      .set('Cookie', customerCookie)
      .expect(200);
    expect(noBodyPurchase.body.quantity).toBe(3);
  });

  it('allows one authenticated purchase, then reports out of stock without going negative', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie, { ...vehicle, quantity: 1 });

    const purchased = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/purchase`)
      .set('Cookie', customerCookie)
      .expect(200);
    expect(purchased.body).toMatchObject({ quantity: 0, version: 2 });

    const unavailable = await request(system!.app)
      .post(`/api/vehicles/${created.body.id}/purchase`)
      .set('Cookie', customerCookie)
      .expect(409);
    expect(unavailable.body.error.code).toBe('OUT_OF_STOCK');
    expect(
      system!.database.prepare('SELECT quantity FROM vehicles WHERE id = ?').get(created.body.id)
    ).toEqual({ quantity: 0 });
  });

  it('serializes concurrent last-unit purchases so stock never drops below zero', async () => {
    const adminCookie = await bootstrapAdminAndLogin(system!);
    const customerCookie = await registerCustomer(system!);
    const created = await createVehicleAsAdmin(adminCookie, { ...vehicle, quantity: 1 });

    const purchases = await Promise.all([
      request(system!.app)
        .post(`/api/vehicles/${created.body.id}/purchase`)
        .set('Cookie', customerCookie),
      request(system!.app)
        .post(`/api/vehicles/${created.body.id}/purchase`)
        .set('Cookie', customerCookie)
    ]);
    expect(purchases.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      system!.database
        .prepare('SELECT quantity, version FROM vehicles WHERE id = ?')
        .get(created.body.id)
    ).toEqual({ quantity: 0, version: 2 });
  });

  it('returns not found when attempting to purchase an unknown vehicle', async () => {
    const customerCookie = await registerCustomer(system!);
    const response = await request(system!.app)
      .post('/api/vehicles/00000000-0000-4000-8000-000000000001/purchase')
      .set('Cookie', customerCookie)
      .expect(404);
    expect(response.body.error.code).toBe('VEHICLE_NOT_FOUND');
  });
});

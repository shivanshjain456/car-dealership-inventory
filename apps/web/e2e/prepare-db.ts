import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { toMinorUnits } from '@motorline/contracts';
import { createAuthService } from '../../../apps/api/src/auth/service.js';
import { migrateDatabase, openDatabase } from '../../../apps/api/src/db/database.js';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_DATABASE_PATH,
  E2E_JWT_SECRET
} from './constants.js';

const SYNTHETIC_VEHICLES = [
  {
    make: 'Hyundai',
    model: 'Creta N Line',
    category: 'SUV',
    amount: '1895000.00',
    currency: 'INR',
    quantity: 1
  },
  {
    make: 'Kia',
    model: 'EV6 GT-Line',
    category: 'Electric',
    amount: '54990.00',
    currency: 'USD',
    quantity: 2
  },
  {
    make: 'Mahindra',
    model: 'Thar Roxx AX7L',
    category: 'SUV',
    amount: '2399000.00',
    currency: 'INR',
    quantity: 3
  },
  {
    make: 'Tata',
    model: 'Nexon EV Empowered',
    category: 'Electric',
    amount: '1799000.00',
    currency: 'INR',
    quantity: 0
  },
  {
    make: 'Toyota',
    model: 'Hyryder V Hybrid',
    category: 'SUV',
    amount: '1899000.00',
    currency: 'INR',
    quantity: 5
  }
] as const;

async function prepare(): Promise<void> {
  rmSync(E2E_DATABASE_PATH, { force: true });
  rmSync(`${E2E_DATABASE_PATH}-wal`, { force: true });
  rmSync(`${E2E_DATABASE_PATH}-shm`, { force: true });
  const database = openDatabase(E2E_DATABASE_PATH);
  try {
    migrateDatabase(database);
    await createAuthService(database, E2E_JWT_SECRET).createInitialAdmin({
      email: E2E_ADMIN_EMAIL,
      password: E2E_ADMIN_PASSWORD
    });

    const insert = database.prepare(`
      INSERT INTO vehicles (id, make, model, category, price_minor, currency, quantity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const timestamp = new Date().toISOString();
    const seed = database.transaction(() => {
      for (const vehicle of SYNTHETIC_VEHICLES) {
        insert.run(
          randomUUID(),
          vehicle.make,
          vehicle.model,
          vehicle.category,
          toMinorUnits(vehicle.amount, vehicle.currency),
          vehicle.currency,
          vehicle.quantity,
          timestamp,
          timestamp
        );
      }
    });
    seed.immediate();
  } finally {
    database.close();
  }
  console.info('Prepared isolated E2E database with synthetic inventory.');
}

await prepare();

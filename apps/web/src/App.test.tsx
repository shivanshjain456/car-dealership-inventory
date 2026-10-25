import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDto, VehicleDto, VehiclePage } from '@motorline/contracts';
import App from './App.js';

const CUSTOMER: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'driver@example.com',
  role: 'customer',
  createdAt: '2026-10-23T00:00:00.000Z'
};
const ADMIN: UserDto = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.com',
  role: 'admin',
  createdAt: '2026-10-23T00:00:00.000Z'
};

function vehicle(overrides: Partial<VehicleDto> & { version?: number } = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    make: 'Hyundai',
    model: 'Creta N Line',
    category: 'SUV',
    price: { amount: '1895000.00', currency: 'INR' },
    quantity: 3,
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    ...overrides,
    version: overrides.version ?? 1
  };
}

function page(items: VehicleDto[], overrides: Partial<VehiclePage> = {}): VehiclePage {
  const total = overrides.total ?? items.length;
  return {
    items,
    page: 1,
    limit: 20,
    total,
    totalPages: total ? 1 : 0,
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

type FetchImplementation = (url: string, init?: RequestInit) => Response;

function mockFetch(implementation: FetchImplementation) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(implementation(String(input), init))
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function apiErrorResponse(status: number, code: string, message: string) {
  return jsonResponse(status, {
    error: { code, message },
    requestId: '44444444-4444-4444-8444-444444444444'
  });
}

function unauthorized() {
  return apiErrorResponse(401, 'UNAUTHENTICATED', 'Authentication is required.');
}

describe('Motorline Inventory SPA', () => {
  beforeEach(() => {
    mockFetch((url) => (url === '/api/auth/me' ? unauthorized() : jsonResponse(404, {})));
  });

  it('presents sign-in and account creation without exposing public role controls', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: /sign in to explore/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create an account/i }));
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByText(/12 to 128 characters/i)).toBeInTheDocument();
  });

  it('loads the catalog after customer sign-in and clearly disables purchase at zero stock', async () => {
    const user = userEvent.setup();
    const zeroStock = vehicle({
      id: '55555555-5555-4555-8555-555555555555',
      make: 'Tata',
      model: 'Nexon EV Empowered',
      category: 'Electric',
      quantity: 0,
      price: { amount: '1799000.00', currency: 'INR' }
    });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return unauthorized();
      if (url === '/api/auth/login' && init?.method === 'POST')
        return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle(), zeroStock]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: /sign in to explore/i });
    await user.type(screen.getByLabelText(/email address/i), CUSTOMER.email);
    await user.type(screen.getByLabelText(/^password$/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('heading', { name: 'Creta N Line' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nexon EV Empowered' })).toBeInTheDocument();
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /purchase.*Nexon EV Empowered/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /add vehicle/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vehicles',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('sends selected price bounds with their currency when filters are applied', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url.startsWith('/api/vehicles/search')) return jsonResponse(200, page([vehicle()]));
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.type(screen.getByLabelText(/minimum price/i), '20000');
    await user.type(screen.getByLabelText(/maximum price/i), '30000');
    await user.selectOptions(screen.getByLabelText(/^currency$/i), 'USD');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    await waitFor(() => {
      const searchCall = fetchMock.mock.calls.find(([url]) =>
        String(url).startsWith('/api/vehicles/search')
      );
      expect(searchCall).toBeDefined();
      const query = new URL(String(searchCall?.[0]), 'http://motorline.test').searchParams;
      expect(query.get('minPrice')).toBe('20000');
      expect(query.get('maxPrice')).toBe('30000');
      expect(query.get('currency')).toBe('USD');
    });
  });

  it('keeps each vehicle action busy while different vehicle requests overlap', async () => {
    const user = userEvent.setup();
    const secondVehicle = vehicle({
      id: '77777777-7777-4777-8777-777777777777',
      make: 'Toyota',
      model: 'Corolla Cross'
    });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle(), secondVehicle]));
      if (url.endsWith('/purchase') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: () => new Promise<unknown>(() => {})
        } as Response;
      }
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    const firstPurchase = screen.getByRole('button', { name: 'Purchase Hyundai Creta N Line' });
    const secondPurchase = screen.getByRole('button', {
      name: 'Purchase Toyota Corolla Cross'
    });

    await user.click(firstPurchase);
    await user.click(secondPurchase);

    expect(firstPurchase).toBeDisabled();
    expect(secondPurchase).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/purchase'))).toHaveLength(
      2
    );
  });

  it('updates stock after one purchase and presents actionable feedback', async () => {
    const user = userEvent.setup();
    const initiallyAvailable = vehicle({ quantity: 1 });
    const purchased = vehicle({
      quantity: 0,
      version: 2,
      updatedAt: '2026-10-24T00:00:00.000Z'
    });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([initiallyAvailable]));
      if (url.endsWith('/purchase') && init?.method === 'POST') return jsonResponse(200, purchased);
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: /purchase.*Creta N Line/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Stock updated: one Hyundai Creta N Line unit was deducted. No payment was processed.'
    );
    expect(
      screen.getByText(/purchases update inventory only; no payment is processed/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /purchase.*Creta N Line/i })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/purchase'))).toBe(true);
  });

  it('lets Admins add inventory while customer-facing registration never shows those controls', async () => {
    const user = userEvent.setup();
    let addedVehicle: VehicleDto | undefined;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles' && init?.method === 'POST') {
        const input = JSON.parse(String(init.body)) as Omit<
          VehicleDto,
          'id' | 'createdAt' | 'updatedAt' | 'version'
        >;
        addedVehicle = vehicle({
          id: '66666666-6666-4666-8666-666666666666',
          make: input.make,
          model: input.model,
          category: input.category,
          price: input.price,
          quantity: input.quantity
        });
        return jsonResponse(201, addedVehicle);
      }
      if (url === '/api/vehicles')
        return jsonResponse(200, page(addedVehicle ? [addedVehicle] : []));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('button', { name: /add vehicle/i });
    await user.click(screen.getByRole('button', { name: /add vehicle/i }));
    const form = within(screen.getByRole('region', { name: /add a vehicle/i }));
    await user.type(form.getByLabelText(/^make$/i), 'Kia');
    await user.type(form.getByLabelText(/^model$/i), 'EV6 GT-Line');
    await user.type(form.getByLabelText(/^category$/i), 'Electric');
    await user.type(form.getByLabelText(/price/i), '54990.00');
    await user.selectOptions(form.getByLabelText(/^currency$/i), 'USD');
    await user.type(form.getByLabelText(/starting stock/i), '2');
    await user.click(form.getByRole('button', { name: /save vehicle/i }));

    expect(await screen.findByRole('heading', { name: 'EV6 GT-Line' })).toBeInTheDocument();
    expect(addedVehicle).toMatchObject({ make: 'Kia', model: 'EV6 GT-Line', quantity: 2 });
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/vehicles' && init?.method === 'POST'
    );
    expect(createCall).toBeDefined();
  });

  it('requires a currency for price ranges and resets an empty search', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url.startsWith('/api/vehicles/search')) return jsonResponse(200, page([]));
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.type(screen.getByLabelText('Minimum price'), '20000');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a currency/i);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/vehicles/search'))
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await user.type(screen.getByLabelText('Search the collection'), 'no matching car');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByRole('heading', { name: 'No vehicles match your filters.' });
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(await screen.findByRole('heading', { name: 'Creta N Line' })).toBeInTheDocument();
  });

  it('guides an Admin to add the first vehicle when inventory is empty', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles') return jsonResponse(200, page([]));
      return jsonResponse(404, {});
    });

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'No vehicles have been added yet.' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add your first vehicle' }));
    expect(screen.getByRole('region', { name: 'Add a vehicle' })).toBeInTheDocument();
  });

  it('shows a truthful no-inventory message to Customers without filter-reset instructions', async () => {
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([]));
      return jsonResponse(404, {});
    });

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'No vehicles are available right now.' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/purchases update inventory only; no payment is processed/i)
    ).toBeInTheDocument();
  });

  it('restocks stock for an Admin and announces the updated quantity', async () => {
    const user = userEvent.setup();
    let current = vehicle({ quantity: 2 });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles') return jsonResponse(200, page([current]));
      if (url.endsWith('/restock') && init?.method === 'POST') {
        current = vehicle({ quantity: 5, version: 2 });
        return jsonResponse(200, current);
      }
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Restock' }));
    await user.clear(screen.getByLabelText('Quantity to add for Creta N Line'));
    await user.type(screen.getByLabelText('Quantity to add for Creta N Line'), '3');
    await user.click(screen.getByRole('button', { name: 'Add stock' }));

    expect(await screen.findByText('5 in stock')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/stock updated to 5/i);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/restock'))).toBe(true);
  });

  it('lets an Admin update a vehicle and reloads the current catalog', async () => {
    const user = userEvent.setup();
    let current = vehicle();
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url.startsWith('/api/vehicles/') && init?.method === 'PUT') {
        const input = JSON.parse(String(init.body)) as Omit<
          VehicleDto,
          'id' | 'createdAt' | 'updatedAt' | 'version'
        >;
        current = vehicle({ ...input, model: 'Creta Signature', version: 2 });
        return jsonResponse(200, current);
      }
      if (url === '/api/vehicles') return jsonResponse(200, page([current]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const form = within(screen.getByRole('region', { name: 'Edit vehicle details' }));
    await user.clear(form.getByLabelText('Model'));
    await user.type(form.getByLabelText('Model'), 'Creta Signature');
    await user.click(form.getByRole('button', { name: 'Save vehicle' }));

    expect(await screen.findByRole('heading', { name: 'Creta Signature' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/details updated/i);
    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).startsWith('/api/vehicles/') && init?.method === 'PUT'
    );
    expect(updateCall).toBeDefined();
    expect(new Headers(updateCall?.[1]?.headers).get('If-Match')).toBe('"1"');
  });

  it('refreshes inventory and guides an Admin after a stale edit', async () => {
    const user = userEvent.setup();
    let current = vehicle({ version: 1 });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url.startsWith('/api/vehicles/') && init?.method === 'PUT') {
        current = vehicle({ model: 'Creta Signature', version: 2 });
        return apiErrorResponse(412, 'STALE_WRITE', 'The vehicle changed after it was loaded.');
      }
      if (url === '/api/vehicles') return jsonResponse(200, page([current]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    let form = within(screen.getByRole('region', { name: 'Edit vehicle details' }));
    await user.clear(form.getByLabelText('Model'));
    await user.type(form.getByLabelText('Model'), 'Stale draft');
    await user.click(form.getByRole('button', { name: 'Save vehicle' }));

    expect(await form.findByRole('alert')).toHaveTextContent(/inventory has been refreshed/i);
    expect(form.getByRole('alert')).toHaveTextContent(/cancel and reopen/i);
    expect(form.getByLabelText('Model')).toHaveValue('Stale draft');
    await user.click(form.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    form = within(screen.getByRole('region', { name: 'Edit vehicle details' }));
    expect(form.getByLabelText('Model')).toHaveValue('Creta Signature');

    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).startsWith('/api/vehicles/') && init?.method === 'PUT'
    );
    expect(new Headers(updateCall?.[1]?.headers).get('If-Match')).toBe('"1"');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/vehicles')).toHaveLength(2);
  });

  it('closes a stale delete confirmation and refreshes the latest inventory', async () => {
    const user = userEvent.setup();
    let current = vehicle({ version: 1 });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url.startsWith('/api/vehicles/') && init?.method === 'DELETE') {
        current = vehicle({ model: 'Creta Signature', version: 2 });
        return apiErrorResponse(412, 'STALE_WRITE', 'The vehicle changed after it was loaded.');
      }
      if (url === '/api/vehicles') return jsonResponse(200, page([current]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Delete this vehicle?' })).getByRole(
        'button',
        { name: 'Confirm delete' }
      )
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/changed in another session/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/inventory has been refreshed/i);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Creta Signature' })).toBeInTheDocument();

    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).startsWith('/api/vehicles/') && init?.method === 'DELETE'
    );
    expect(new Headers(deleteCall?.[1]?.headers).get('If-Match')).toBe('"1"');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/vehicles')).toHaveLength(2);
  });

  it('does not claim an edit refresh succeeded when inventory reload fails', async () => {
    const user = userEvent.setup();
    let catalogLoads = 0;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles') {
        catalogLoads += 1;
        return catalogLoads === 1
          ? jsonResponse(200, page([vehicle()]))
          : apiErrorResponse(503, 'SERVICE_UNAVAILABLE', 'Inventory is unavailable.');
      }
      if (url.startsWith('/api/vehicles/') && init?.method === 'PUT') {
        return apiErrorResponse(412, 'STALE_WRITE', 'The vehicle changed after it was loaded.');
      }
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const form = within(screen.getByRole('region', { name: 'Edit vehicle details' }));
    await user.clear(form.getByLabelText('Model'));
    await user.type(form.getByLabelText('Model'), 'Unsaved draft');
    await user.click(form.getByRole('button', { name: 'Save vehicle' }));

    expect(await form.findByRole('alert')).toHaveTextContent(/could not be refreshed/i);
    expect(form.getByRole('alert')).not.toHaveTextContent(/inventory has been refreshed/i);
    expect(form.getByLabelText('Model')).toHaveValue('Unsaved draft');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/vehicles')).toHaveLength(2);
  });

  it('does not claim a delete refresh succeeded when inventory reload fails', async () => {
    const user = userEvent.setup();
    let catalogLoads = 0;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles') {
        catalogLoads += 1;
        return catalogLoads === 1
          ? jsonResponse(200, page([vehicle()]))
          : apiErrorResponse(503, 'SERVICE_UNAVAILABLE', 'Inventory is unavailable.');
      }
      if (url.startsWith('/api/vehicles/') && init?.method === 'DELETE') {
        return apiErrorResponse(412, 'STALE_WRITE', 'The vehicle changed after it was loaded.');
      }
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Delete this vehicle?' })).getByRole(
        'button',
        { name: 'Confirm delete' }
      )
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be refreshed/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/inventory has been refreshed/i);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/vehicles')).toHaveLength(2);
  });

  it('moves focus into the delete dialog, traps it, and restores focus on Escape', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this vehicle?' });
    const keepButton = within(dialog).getByRole('button', { name: 'Keep vehicle' });
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm delete' });
    expect(keepButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
  });

  it('confirms Admin hard-delete and gives a clear empty state', async () => {
    const user = userEvent.setup();
    let deleted = false;
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url.startsWith('/api/vehicles/') && init?.method === 'DELETE') {
        deleted = true;
        return jsonResponse(204, undefined);
      }
      if (url === '/api/vehicles') return jsonResponse(200, page(deleted ? [] : [vehicle()]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Delete this vehicle?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep vehicle' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('alertdialog', { name: 'Delete this vehicle?' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));
    expect(
      await screen.findByRole('heading', { name: 'No vehicles have been added yet.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first vehicle' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/removed from inventory/i);
    const deleteCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).startsWith('/api/vehicles/') && init?.method === 'DELETE'
    );
    expect(deleteCall).toBeDefined();
    expect(new Headers(deleteCall?.[1]?.headers).get('If-Match')).toBe('"1"');
  });

  it('navigates between catalog pages while preserving the requested page size', async () => {
    const user = userEvent.setup();
    const secondVehicle = vehicle({
      id: '77777777-7777-4777-8777-777777777777',
      make: 'Toyota',
      model: 'Corolla Cross'
    });
    const fetchMock = mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles')
        return jsonResponse(200, page([vehicle()], { limit: 1, total: 2, totalPages: 2 }));
      const query = new URL(url, 'http://motorline.test').searchParams;
      return jsonResponse(
        200,
        page(query.get('page') === '2' ? [secondVehicle] : [vehicle()], {
          page: Number(query.get('page') ?? 1),
          limit: Number(query.get('limit') ?? 1),
          total: 2,
          totalPages: 2
        })
      );
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('heading', { name: 'Corolla Cross' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Vehicle pages' })).toHaveTextContent(
      'Page 2 of 2'
    );
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(await screen.findByRole('heading', { name: 'Creta N Line' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2&limit=1'))).toBe(true);
  });

  it('returns to sign-in with a notice when the current token expires during catalog load', async () => {
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return unauthorized();
      return jsonResponse(404, {});
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: /sign in to explore/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/session has ended/i);
  });

  it('does not claim sign-out succeeded when the logout API is unavailable', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      if (url === '/api/auth/logout') throw new Error('offline');
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm sign out/i);
    expect(screen.getByRole('heading', { name: 'Creta N Line' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sign in to explore/i })).not.toBeInTheDocument();
  });

  it('ends the session after the logout API confirms the request', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      if (url === '/api/auth/logout') return jsonResponse(204, undefined);
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: /sign in to explore/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/session has ended/i);
  });

  it('reports a last-unit conflict after refreshing inventory', async () => {
    const user = userEvent.setup();
    let current = vehicle({ quantity: 1 });
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: CUSTOMER });
      if (url === '/api/vehicles') return jsonResponse(200, page([current]));
      if (url.endsWith('/purchase') && init?.method === 'POST') {
        current = vehicle({ quantity: 0, version: 2 });
        return apiErrorResponse(409, 'OUT_OF_STOCK', 'This vehicle is currently out of stock.');
      }
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Purchase Hyundai Creta N Line' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/just sold out/i);
    expect(screen.getByRole('button', { name: 'Purchase Hyundai Creta N Line' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/vehicles')).toHaveLength(2);
  });

  it('shows validation feedback for a rejected Admin edit without discarding the form', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse(200, { user: ADMIN });
      if (url.startsWith('/api/vehicles/') && init?.method === 'PUT') {
        return apiErrorResponse(
          422,
          'VALIDATION_ERROR',
          'Price is invalid for the selected currency.'
        );
      }
      if (url === '/api/vehicles') return jsonResponse(200, page([vehicle()]));
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Creta N Line' });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const form = within(screen.getByRole('region', { name: 'Edit vehicle details' }));
    await user.click(form.getByRole('button', { name: 'Save vehicle' }));

    expect(await form.findByRole('alert')).toHaveTextContent(/price is invalid/i);
    expect(form.getByLabelText('Model')).toHaveValue('Creta N Line');
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).startsWith('/api/vehicles/') && init?.method === 'PUT'
      )
    ).toBe(true);
  });

  it('shows the authentication error for an invalid sign-in attempt', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url === '/api/auth/me') return unauthorized();
      if (url === '/api/auth/login')
        return apiErrorResponse(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      return jsonResponse(404, {});
    });

    render(<App />);
    await screen.findByRole('heading', { name: /sign in to explore/i });
    await user.type(screen.getByLabelText('Email address'), 'driver@example.com');
    await user.type(screen.getByLabelText('Password'), 'incorrect local passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/email or password is incorrect/i);
  });
});

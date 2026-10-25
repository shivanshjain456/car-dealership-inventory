import {
  apiErrorSchema,
  type LoginInput,
  type RegisterInput,
  type UserDto,
  type VehicleDto,
  type VehicleInput,
  type VehiclePage
} from '@motorline/contracts';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: HeadersInit } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');

  const requestInit: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers
  };
  if (options.body !== undefined) requestInit.body = JSON.stringify(options.body);
  const response = await fetch(path, requestInit);

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      response.status,
      parsedError.success ? parsedError.data.error.code : 'REQUEST_FAILED',
      parsedError.success ? parsedError.data.error.message : 'The request could not be completed.'
    );
  }

  return payload as T;
}

export const api = {
  currentUser(): Promise<{ user: UserDto }> {
    return request('/api/auth/me');
  },

  login(input: LoginInput): Promise<{ user: UserDto }> {
    return request('/api/auth/login', { method: 'POST', body: input });
  },

  register(input: RegisterInput): Promise<{ user: UserDto }> {
    return request('/api/auth/register', { method: 'POST', body: input });
  },

  logout(): Promise<void> {
    return request('/api/auth/logout', { method: 'POST' });
  },

  listVehicles(query?: URLSearchParams): Promise<VehiclePage> {
    const queryString = query?.toString();
    return request(queryString ? `/api/vehicles/search?${queryString}` : '/api/vehicles');
  },

  createVehicle(input: VehicleInput): Promise<VehicleDto> {
    return request('/api/vehicles', { method: 'POST', body: input });
  },

  updateVehicle(id: string, input: VehicleInput, expectedVersion: number): Promise<VehicleDto> {
    return request(`/api/vehicles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
      headers: { 'If-Match': `"${expectedVersion}"` }
    });
  },

  deleteVehicle(id: string, expectedVersion: number): Promise<void> {
    return request(`/api/vehicles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${expectedVersion}"` }
    });
  },

  purchaseOne(id: string): Promise<VehicleDto> {
    return request(`/api/vehicles/${encodeURIComponent(id)}/purchase`, { method: 'POST' });
  },

  restock(id: string, quantity: number): Promise<VehicleDto> {
    return request(`/api/vehicles/${encodeURIComponent(id)}/restock`, {
      method: 'POST',
      body: { quantity }
    });
  }
};

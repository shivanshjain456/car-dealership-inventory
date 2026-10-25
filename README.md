# Motorline Inventory

Motorline Inventory is a full-stack vehicle inventory application with a customer catalog and an Admin interface. It uses a React frontend, an Express API, and persistent SQLite storage.

## Screenshots

| Customer inventory - desktop                                      | Admin - empty inventory                                                  | Admin - first vehicle form                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| ![Customer inventory on desktop](screenshots/catalog-desktop.png) | ![Admin empty-inventory guidance](screenshots/admin-inventory-empty.png) | ![Admin adding the first vehicle](screenshots/admin-add-first-vehicle.png) |

| Admin inventory editor                                        | Customer inventory - narrow mobile                             |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| ![Admin vehicle editor](screenshots/admin-inventory-edit.png) | ![Responsive mobile inventory](screenshots/catalog-mobile.png) |

## Capabilities

- Customer registration and sign-in. Public registration always creates the `customer` role; role input is rejected.
- Short-lived signed JWT sessions in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production).
- Authenticated, paginated catalog and search by free text, make, model, category, and price bounds.
- Each price has an ISO 4217 currency. Prices persist as integer minor units; price comparisons require the same explicit currency and never perform foreign-exchange conversion.
- One-unit purchase requests make a conditional, atomic stock decrement. Zero-stock vehicles remain visible and cannot be purchased.
- Admin-only create, full update, restock, and hard delete, enforced at the API boundary as well as the UI. Updates/deletes use revision preconditions so stale Admin screens cannot overwrite/delete newer stock.
- File-backed SQLite migrations and constraints; no in-memory database or runtime dummy-data fallback.
- Responsive React/Tailwind SPA with loading, error, success, and distinct empty-catalog/empty-filter states; keyboard interaction and selected Axe checks.

## Stack

- **Runtime:** Node.js 22.20.0, npm 10.8+
- **API:** TypeScript, Express 5, Zod, JOSE, `better-sqlite3`
- **Web:** React 19, TypeScript, Tailwind CSS 4, Vite 8
- **Tests:** Vitest, Supertest, Testing Library, Playwright, Axe

This is an npm-workspaces monorepo: `apps/api`, `apps/web`, and shared validation/money contracts in `packages/contracts`.

## Architecture

```mermaid
flowchart LR
    actors["Customer / Admin"]
    spa["Browser SPA<br/>React 19 · Tailwind CSS<br/>catalog/search · Admin workflows"]
    actors --> spa

    subgraph node["Node.js runtime"]
        api["Express 5 API<br/>/api/auth · /api/vehicles"]
        auth["Auth routes/service<br/>register/login/logout · rate limits<br/>scrypt password hashes · short-lived JWT cookie"]
        guards["Vehicle request pipeline<br/>Zod validation · JWT authentication<br/>customer/Admin authorization"]
        vehicles["Vehicle routes/repository<br/>search/pagination · Admin create/update/restock/hard delete<br/>ETag/If-Match on update/delete · atomic stock-only purchase"]
        sqlite_adapter["better-sqlite3<br/>migrations · SQL constraints"]
        api --> auth
        api --> guards
        guards --> vehicles
        auth --> sqlite_adapter
        vehicles --> sqlite_adapter
    end

    data[("File-backed SQLite<br/>users · vehicles<br/>currency-specific integer minor-unit prices")]
    sqlite_adapter --> data
    spa <-->|"same-origin /api · JSON · HttpOnly JWT session cookie"| api

    contracts["packages/contracts<br/>shared Zod schemas · money/currency rules"]
    contracts -.->|shared by| spa
    contracts -.->|shared by| api
```

## Local setup

### Requirements

- Node.js **22.20.0** (`.nvmrc`) and npm **10.8+**
- A platform supported by `better-sqlite3`

### First run

From the repository root:

```sh
npm ci
npm run setup          # writes an ignored .env with a fresh JWT signing secret
npm run db:migrate     # creates/migrates an empty local SQLite database
npm run admin:create   # one-time, interactive; password input is hidden
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:3001>; Vite proxies `/api` to it. Sign in with the Admin you created and add the first vehicle through **Add vehicle**. No demo inventory is seeded and no default account or password is shipped. Public registration creates customers only; it cannot create an Admin.

`npm run admin:create` succeeds only while no Admin exists. It prompts for email/password without placing the password in shell history or command arguments. Subsequent Admins require a separately designed administrative process; this kata exposes no public role-promotion endpoint.

### Environment configuration

`npm run setup` creates `.env` with a cryptographically random signing secret and safe local defaults. `.env` and SQLite files are ignored by Git. Do not commit real secrets or database files. For manual configuration, copy `.env.example` to `.env`, replace `JWT_SECRET` with a random value of at least 32 bytes, and set the database path/port as needed. The example secret is deliberately rejected by the API.

| Variable              | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`, `test`, or `production`; production enables secure cookies |
| `PORT`                | API port; defaults to `3001`                                              |
| `DATABASE_PATH`       | SQLite path, resolved from the repository root when relative              |
| `JWT_SECRET`          | Required signing key, at least 32 bytes; no runtime fallback              |
| `AUTH_RATE_LIMIT_MAX` | Login/register attempts per IP per 15-minute window; defaults to `10`     |
| `LOG_LEVEL`           | Reserved runtime setting (`error`, `warn`, `info`, `debug`)               |

### Build and production-style start

```sh
npm run build
NODE_ENV=production npm start
```

The build compiles the API and SPA. The API serves `apps/web/dist` and `/api` from one origin. Use HTTPS in any hosted environment so the production session cookie remains secure. Configure `JWT_SECRET`, `DATABASE_PATH`, and `PORT` through the host’s secret/configuration facility.

## API overview

All routes use `/api`. List/search requires an authenticated user. All inventory mutations are Admin-only, except the one-unit purchase operation, available to authenticated users.

| Method and path                   | Access | Purpose                                                    |
| --------------------------------- | ------ | ---------------------------------------------------------- |
| `POST /api/auth/register`         | Public | Register a Customer and start a session                    |
| `POST /api/auth/login`            | Public | Start a session                                            |
| `POST /api/auth/logout`           | Public | Clear the session cookie                                   |
| `GET /api/auth/me`                | User   | Return the current safe user DTO                           |
| `GET /api/vehicles`               | User   | Paged inventory, including zero-stock vehicles             |
| `GET /api/vehicles/search`        | User   | Search/filter the inventory                                |
| `POST /api/vehicles`              | Admin  | Add a vehicle; server generates its UUID                   |
| `PUT /api/vehicles/:id`           | Admin  | Replace all mutable fields; requires `If-Match` revision   |
| `DELETE /api/vehicles/:id`        | Admin  | Hard-delete with `If-Match`; returns `204`                 |
| `POST /api/vehicles/:id/purchase` | User   | Atomically decrement exactly one unit; request has no body |
| `POST /api/vehicles/:id/restock`  | Admin  | Add a positive whole-number stock quantity                 |

A vehicle has `id`, `make`, `model`, `category`, `price: { amount, currency }`, `quantity`, `version`, and timestamps. `amount` is a decimal string in major units at the API boundary; SQLite stores price as an integer in the currency’s minor units. New vehicles start at version 1; purchases and restocks increment the version as well as updates. `GET` responses include the current version; create/update responses also return a matching strong `ETag`. Admin `PUT`/`DELETE` must send that quoted version as `If-Match` (for example, `If-Match: "2"`). Missing preconditions return `428`, malformed values `400`, and stale writes `412 STALE_WRITE`; a stale full replacement cannot restore stock changed by a purchase.

Example search:

```text
GET /api/vehicles/search?q=electric&minPrice=20000.00&maxPrice=60000.00&currency=USD&page=1&limit=20
```

A price bound without `currency` is invalid. Search text is case-insensitive partial matching; `%`, `_`, and the escape character are treated literally rather than as SQL wildcards. Pagination defaults to 20 records and caps `limit` at 100. See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for exact request/status conventions and the role matrix.

## Tests and quality checks

```sh
npm run test:contracts
npm run test:api
npm run test:web
npm run test:unit       # all Vitest/Supertest suites
npm run test:e2e        # real API + Vite + Chromium journeys and Axe checks
npm run typecheck
npm run lint
npm run format:check
npm run coverage
npm run security:secrets # current-tree secret/data scan
npm run verify           # all of the above quality and security gates
```

Playwright needs Chromium and its Linux runtime libraries. On a fresh machine:

```sh
npx playwright install chromium
npx playwright install-deps chromium   # Linux only
```

The E2E setup creates an isolated file-backed database at `apps/api/data/e2e.sqlite`, inserts vehicles and an Admin, starts API + Vite, and runs browser flows for registration/purchase, Admin edit/restock/delete, keyboard/mobile/Axe checks, and Admin first-inventory onboarding. E2E databases, credentials, and Playwright outputs are test-only/ignored.

## Data and security boundaries

- Passwords are stored as salted scrypt hashes. Registration/login are rate-limited; unknown-account and incorrect-password responses are generic.
- Strict Zod schemas validate requests. Role checks are server-side. SQL values use prepared statements; search wildcards are escaped.
- Purchase means **stock decrement only**. It does not process money, create an order/history record, reserve/hold a vehicle, or guarantee availability after the response.
- Hard delete is intentional and has no archive/restore behavior. No FX, analytics, real payment gateway, or customer-account administration is included.
- First Admin is provisioned locally and once; there is no public Admin registration or role promotion.
- No external fonts, photos, analytics, or runtime CDN dependencies are required.

## My AI usage

I used ChatGPT Codex, Claude and Arena.ai to review requirements and code, propose regression tests, implement fixes, and check documentation and verification results. It sped up review and iteration; I validated the work against project requirements and automated tests and remain responsible for the final result.
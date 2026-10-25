# System map

This map describes the application, its disposable Render Free demo profile, and the limits that separate verified behavior from durable production operation.

## Architecture

```text
React 19 + TypeScript + Tailwind SPA
  ├─ same-origin fetch('/api/...', credentials: include)
  ├─ development: Vite proxies /api to Express
  └─ production-style build: Express serves the SPA and API from one origin; the shell supports GET/HEAD and revalidates, while content-hashed assets are cached immutably

Express 5 + TypeScript API
  ├─ request IDs, security headers, JSON parsing, rate limits, safe error envelope
  ├─ auth routes -> scrypt password service + signed JWT HttpOnly cookie
  ├─ vehicle routes -> authentication -> API-side Admin role checks
  └─ repositories -> prepared SQL -> better-sqlite3 -> file-backed SQLite

Shared package: Zod request/DTO contracts and currency-aware money conversion
```

Important implementation areas:

- `apps/api/src/app.ts`, `server.ts`: middleware, route composition, startup and SPA serving.
- `apps/api/src/auth/`, `apps/api/src/middleware/`: registration, login, session checks, role enforcement and safe error responses.
- `apps/api/src/vehicles/`: request validation and inventory repository operations.
- `apps/api/src/db/`: file-backed SQLite configuration and versioned migrations.
- `apps/web/src/App.tsx`, `api.ts`, `components/`: session flow, catalog, filters, Admin forms, and feedback states.
- `packages/contracts/src/`: strict schemas and exact currency/minor-unit conversion.

## Authentication and data ownership

1. The SPA checks the current session, then shows sign-in or Customer registration.
2. Registration normalizes email and always creates the `customer` role. It cannot assign or promote an Admin.
3. Passwords are salted scrypt hashes. Login/register are rate-limited; signed one-hour JWTs with unique token IDs are carried in an HttpOnly, SameSite=Strict cookie, marked Secure in production.
4. Logout records the presented token ID as revoked until its expiry and clears the cookie. Reusing that copied token fails authentication, while a different session for the same user remains valid.
5. Protected routes look up the account from the verified, unrevoked token. Create/update/delete/restock are Admin-only at the API boundary.
6. A fresh local database is empty. The first Admin is provisioned once through the local interactive CLI; synthetic inventory/accounts are isolated to tests and screenshots. The hosted demo is the explicit exception: its Render start command recreates a disposable E2E database with a public demo Admin and five synthetic vehicles at process start.

## Inventory and stock integrity

- List/search returns a paginated catalog that includes zero-stock vehicles. A deterministic SQLite function and the query builder use the same NFKC-normalized, lowercased text, giving Unicode case-insensitive matching and ordering. Search can filter a price range only within one explicit ISO currency.
- Vehicle prices cross the API boundary as decimal strings and persist as integer minor units. Currency precision is respected; no FX conversion occurs.
- Purchase accepts no request body and decrements exactly one unit through a conditional SQL update. No payment, order, reservation, receipt, or purchase-history ledger exists.
- Restock is Admin-only and adds a positive whole quantity atomically. Update/delete are Admin-only and require the observed `If-Match` revision. The origin emits a strong revision `ETag`; if a hosted intermediary rewrites it to the weak spelling, the API still accepts that one exact integer while rejecting lists, wildcards, and non-numeric tags.
- Update, purchase, and restock increment the vehicle revision. A stale Admin update/delete returns a conflict and cannot overwrite stock changed by a purchase or another edit.
- Hard delete is intentional and irreversible; there is no archive or restore workflow.

## Interface state and accessibility behavior

- Customer screens distinguish no inventory from a filter with no matches. Admins receive an add-first-vehicle path when the unfiltered catalog is empty.
- Success/error/loading feedback follows API outcomes. Purchase copy says that no payment is processed. A failed logout or inventory refresh is not reported as success.
- The delete confirmation moves focus inside, contains keyboard focus, supports Escape while idle, and restores focus to the trigger or collection heading.
- In-flight purchase/restock actions are tracked per vehicle, preventing one overlapping action from re-enabling a second pending action.
- Automated browser checks exercise selected Axe rules, keyboard filter activation, and a 320px layout. This is selected accessibility coverage, not a full WCAG conformance or assistive-technology audit.

## Persistence and operations

- `users` stores a UUID, normalized unique email, password hash, role and creation time.
- `vehicles` stores UUID, make/model/category, integer minor-unit price, ISO currency, nonnegative quantity, positive revision and timestamps.
- `revoked_session_tokens` stores only a logged-out JWT's ID, its original expiry, and the revocation time. Expired revocation rows are pruned when another logout is recorded.
- Migrations are additive and run transactionally. Tests use file-backed temporary databases; the E2E suite uses a separate synthetic test database.
- SQLite WAL, busy timeout, foreign keys and full synchronous writes are configured. No production backup/restore, HA, monitoring, load or disaster-recovery test has been performed.
- The public link in the README is a Render Free demo, not durable production hosting: it may sleep for roughly a minute before the first response, and its database resets to the demo seed on restart/redeploy or after spin-down. Some SQL-looking search text can also be rejected by the hosted edge before it reaches the parameterized origin queries.

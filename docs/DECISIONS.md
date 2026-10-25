# Product and implementation decisions

## Owner-confirmed

| Topic         | Decision                                                                                          | Evidence / boundary                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Backend       | TypeScript + Express                                                                              | One of the choices allowed in the assessment                                                              |
| Frontend      | React + Tailwind                                                                                  | Explicit assessment requirement                                                                           |
| Database      | SQLite, file-backed                                                                               | SQLite is explicitly allowed; in-memory-only database is not                                              |
| Authorization | Add, update, delete, and restock are Admin-only; authenticated users may list/search and purchase | Owner selected the stricter mutation policy because the UI describes Admin forms; server enforces it      |
| Currency      | Each vehicle has an ISO currency code                                                             | Owner-selected to avoid guessing a global currency                                                        |
| Price storage | Integer minor units for the vehicle's currency                                                    | Avoids floating-point money arithmetic; price filters require a currency                                  |
| Purchase      | One vehicle/unit per request; atomic decrement                                                    | No payment integration or purchase ledger/history                                                         |
| Delete        | Hard-delete the vehicle                                                                           | Owner-confirmed; no order history is in scope                                                             |
| First Admin   | One-time local CLI bootstrap; no public role assignment                                           | Owner delegated selection of the safest fit; public registration is customer-only                         |
| Hosted demo   | One Render Free Web Service with a disposable, reseeded demo database                             | Lets reviewers inspect the complete app without local setup or cost; it is not durable production hosting |

## Explicit assignment requirements

- Register/login and token-based authentication.
- Protected vehicle APIs; admin-only delete and restock are explicitly named in the PDF.
- Vehicle ID, make, model, category, price, quantity.
- Search by make, model, category, and/or price range.
- React SPA with registration/login, dashboard, filters, Purchase disabled at zero stock, and Admin forms.
- Meaningful TDD with visible Red–Green–Refactor history, frequent descriptive commits, public repository, setup/run documentation, screenshots, test report, `My AI Usage`, and a root `PROMPTS.md`. The supplied brief asks for raw prompts; the current owner-directed submission choice is generated retrospective phase templates, clearly labeled as not verbatim or contemporaneous. Deployment was optional in the brief, and the repository now also links the free hosted demo described in the README.

## Implementation conventions

- Registration takes normalized email + password. Email is the login identifier. Passwords must be 12-128 characters (no composition rules) and are stored only as salted scrypt hashes. A configurable JWT signing secret is mandatory; no insecure fallback/default secret. Access token lifetime: one hour; store it in an HttpOnly, SameSite=Strict cookie (Secure in production). Each token carries a unique ID. Logout revokes only the presented token until its expiry, so a copied token cannot be replayed while another legitimate session remains signed in.
- New registrations have the `customer` role. Strict request schemas reject unknown/role fields. The Admin CLI can run only when no Admin exists and prompts for credentials without putting the password in command history.
- Vehicle IDs are server-generated UUIDs. Make/model/category are required, trimmed strings; quantities are whole non-negative integers. Restock quantity is a positive integer; purchase is one unit.
- Search text matching is Unicode case-insensitive partial matching over make/model/category, using NFKC normalization and lowercasing on both stored values and query parameters. Price bounds are decimal strings interpreted using the selected ISO currency's minor-unit exponent; min/max requires a currency and rejects min > max. No FX conversion.
- List/search includes zero-stock catalog entries, so the explicit disabled-Purchase UI state is observable. Default pagination is 20 items, maximum 100.
- `PUT` replaces the full mutable vehicle representation. `DELETE` hard-deletes and returns no body. Successful purchase/restock returns the updated vehicle.
- Vehicle create/update responses carry the revision as an origin-strong `ETag`. Because hosted intermediaries can rewrite it to `W/"<revision>"`, the precondition parser accepts either spelling of one exact positive integer and continues to reject wildcards, lists, and non-numeric values.
- Use 201 for creation, 200 for successful reads/mutations, 204 for logout/delete, 400 for malformed requests/If-Match, 401 for missing/invalid authentication, 403 for role denial, 404 for absent vehicles, 409 for duplicate email/out-of-stock/quantity or revision limits, 412 for stale vehicle writes, 422 for structurally valid JSON with invalid domain fields, and 428 for missing If-Match. These are API conventions, not prompt-specified codes.
- Same-origin UI/API. Vite proxies `/api` in development; production serves the built SPA from the API. No broad CORS allowlist.
- Synthetic vehicle/account records are test-scoped in normal application startup; no production seed, default user, or Admin password is shipped for a real installation. The explicit Render demo start command reuses the E2E fixture to recreate a disposable public demo database because the free service cannot retain that database or run the local bootstrap CLI.

## Deliberate non-goals

No payroll/salary features, 10,000-row employee seed, real payment processing, third-party candidate code, durable production hosting, FX service, or analytics. The free Render deployment is explicitly an ephemeral reviewer demo, not a production durability, backup, or availability claim.

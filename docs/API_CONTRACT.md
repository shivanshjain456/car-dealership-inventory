# API contract

This document maps the assessment's required operations to concrete HTTP behavior. The route list and core roles come from the outer PDF; the body shapes, statuses, cookies, pagination, and error envelope below are documented implementation conventions, not additional official instructions.

Base path: `/api`. JSON requests/responses use UTF-8. All errors use `{ "error": { "code": "...", "message": "...", "fields"?: [...] }, "requestId": "..." }`; never include stack traces, password hashes, or signing material.

## Authentication

| Method / path             | Auth   | Request                | Success                                                           |
| ------------------------- | ------ | ---------------------- | ----------------------------------------------------------------- |
| `POST /api/auth/register` | Public | `{ email, password }`  | `201`, safe user DTO, HttpOnly JWT cookie; always role `customer` |
| `POST /api/auth/login`    | Public | `{ email, password }`  | `200`, safe user DTO, HttpOnly JWT cookie                         |
| `POST /api/auth/logout`   | Public | Optional session token | `204`, revoke the presented valid token ID and clear auth cookie  |
| `GET /api/auth/me`        | User   | —                      | `200`, safe current-user DTO                                      |

Registration rejects extra fields (including `role`). Email is trimmed/lowercased and unique. Password policy and token lifetime are documented project conventions; no Admin is created through registration.

Each one-hour JWT contains a unique `jti`. `POST /api/auth/logout` stores a presented valid token's ID in `revoked_session_tokens` until its expiry and clears the cookie. Reusing that copied cookie or bearer token then returns `401 UNAUTHENTICATED`; a different session for the same user remains valid. Logout with no, malformed, or expired token still returns `204` so it is idempotent. Tokens minted before this convention, which have no `jti`, are rejected and require a fresh sign-in.

## Vehicles

Vehicle DTO: `{ id, make, model, category, price: { amount, currency }, quantity, version, createdAt, updatedAt }`. `version` is a positive integer revision. `amount` is a decimal string in the currency's major units; persistence uses integer minor units. IDs are server-generated UUIDs.

| Method / path                     | Role  | Request / behavior                                                                                | Success                                                                                  |
| --------------------------------- | ----- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /api/vehicles`              | Admin | `{ make, model, category, price: { amount, currency }, quantity }`                                | `201`, created vehicle with `version: 1`, `ETag: "1"`, and `Cache-Control: no-transform` |
| `GET /api/vehicles`               | User  | `?page=1&limit=20`                                                                                | `200`, paged catalog, including zero-stock entries                                       |
| `GET /api/vehicles/search`        | User  | Optional `q`, `make`, `model`, `category`, `minPrice`, `maxPrice`, `currency`, `page`, `limit`    | `200`, matching page; price bounds require `currency`                                    |
| `PUT /api/vehicles/:id`           | Admin | Full replacement of mutable fields; requires `If-Match: "<version>"` or `If-Match: W/"<version>"` | `200`, updated vehicle, current `ETag`, and `Cache-Control: no-transform`                |
| `DELETE /api/vehicles/:id`        | Admin | Requires either exact revision spelling above; hard-delete; no purchase history is kept           | `204`                                                                                    |
| `POST /api/vehicles/:id/purchase` | User  | No body; exactly one unit                                                                         | `200`, updated vehicle; `409 OUT_OF_STOCK` if none remains                               |
| `POST /api/vehicles/:id/restock`  | Admin | `{ quantity }`, positive integer                                                                  | `200`, updated vehicle                                                                   |

New vehicles start at revision 1. Every successful update, purchase, and restock increments the vehicle revision; customers and Admins can read it in the returned DTO. Create/update responses also expose a strong `ETag` from the origin equal to the quoted revision, with `Cache-Control: no-transform`. Hosted intermediaries may rewrite it to the weak spelling (for example, `W/"3"`) while preserving the opaque integer. Admin update and delete therefore accept either spelling of one exact positive-integer revision in `If-Match`. For otherwise valid update/delete requests, missing `If-Match` returns `428 PRECONDITION_REQUIRED`; a malformed, non-numeric, wildcard, list, or unsafe-integer value returns `400 INVALID_IF_MATCH`; a revision that no longer matches returns `412 STALE_WRITE` without changing or deleting the current record. The strict single-revision convention prevents a stale full replacement from restoring stock that a Customer has purchased. This inventory API does not create an order or process payment.

Search is Unicode case-insensitive partial text matching. Stored fields and query text are compatibility-normalized (NFKC) and lowercased before comparison, so searches such as `ško`, `ünic`, and `ŠKODA` match their mixed-case records; SQL wildcard characters remain literal. If a price bound is present, `currency` is required and amounts are converted using that currency's ISO minor-unit precision. Cross-currency comparisons and FX are not performed. A currency supplied without a price bound filters to that currency. `page` defaults to 1 and is capped at 1,000,000 to bound offsets; `limit` defaults to 20 and is capped at 100.

## Role matrix

| Operation                           | Anonymous | Customer | Admin |
| ----------------------------------- | --------: | -------: | ----: |
| Register/login                      |       Yes |      Yes |   Yes |
| List/search                         |        No |      Yes |   Yes |
| Purchase one unit                   |        No |      Yes |   Yes |
| Add/update/delete/restock           |        No |       No |   Yes |
| Create/promote an Admin through API |        No |       No |    No |

Initial Admin creation for a real installation is an out-of-band local CLI operation, available only before an Admin exists. The separately documented Render demo profile creates its intentionally public Admin only inside its disposable demo database at process start.

## Status conventions

- `400` malformed JSON/query syntax or invalid `If-Match`; `401` missing, invalid, expired, or revoked token; `403` authenticated but unauthorized role; `404` unknown vehicle/route; `409` duplicate email, out of stock, or conflicting bootstrap; `412` stale vehicle revision; `422` valid JSON with invalid fields; `428` missing required `If-Match`; `429` rate limit.
- Database and unexpected errors map to generic `500` responses with a request ID; internal details are logged without credentials.

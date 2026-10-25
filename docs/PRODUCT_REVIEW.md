# Product and implementation review

Motorline Inventory is a locally runnable dealership-inventory proof of concept with an additional free, disposable Render demo linked from the README.

## Verified product journeys

- A new local installation starts with an empty file-backed SQLite database. The first Admin is provisioned through a one-time local interactive CLI; public registration creates Customers only. The Render demo instead recreates its public demo Admin and five synthetic vehicles whenever its disposable service starts.
- Customers can authenticate, browse/search a paginated catalog, see zero-stock items, and request an atomic one-unit stock decrement.
- Admins can add, replace, restock, and hard-delete vehicles. The API enforces Admin roles. Revision preconditions prevent stale screens from overwriting/deleting newer stock.
- Prices remain attached to ISO currency codes and persist as exact minor units. Search price bounds require a currency and do not compare across currencies.
- The interface distinguishes empty inventory from an empty filtered result. Purchase copy states that no payment is processed; logout and refresh errors do not claim success.

## Audit findings fixed

1. Purchase accepted empty JSON arrays/objects and non-JSON payloads even though the contract requires a bodyless request. The route now rejects nonempty request bodies without changing stock.
2. The hard-delete confirmation advertised itself as modal but did not manage keyboard focus. Focus now moves into the dialog, is contained while open, and returns to a sensible target on dismissal.
3. A single busy-vehicle ID could be overwritten when different inventory requests overlapped, re-enabling the earlier action. Busy state is now tracked per vehicle, with a synchronous duplicate-action guard.
4. The hosted edge rewrote vehicle revision ETags from `"1"` to `W/"1"`, while the origin rejected the returned validator as `If-Match`. The origin still emits the strong form with `no-transform`; the precondition parser now accepts either spelling of one exact integer and continues to reject malformed or stale revisions.
5. Search was documented as case-insensitive but SQLite's built-in matching folded only ASCII. Search and ordering now normalize both stored text and queries with Unicode-aware NFKC normalization and lowercasing.
6. `HEAD /` returned 404, hashed assets were not immutable, and `/favicon.ico`/`/robots.txt` were missing. The SPA fallback now supports HEAD, the HTML shell revalidates while hashed assets use a one-year immutable policy, and the site ships an SVG icon, a legacy ICO success fallback, and crawler metadata.
7. A copied JWT remained usable after browser logout because logout only cleared the cookie. Tokens now have unique IDs, and logout revokes the presented token until expiry without ending unrelated sessions.

## Reliability and security evidence

**Runtime tested:** authentication and role checks, revocable logout, file-backed persistence, migration upgrade, money validation, Unicode search filters, atomic stock update, last-unit concurrency, stale-write conflicts, SPA HEAD/cache behavior, responsive/browser journeys, and selected accessibility checks. The 25 October 2026 live QA reproduced the ETag, Unicode-search, and `HEAD /` defects above; the focused post-deploy recheck passed health, HEAD/cache/icon checks, replay of the edge-returned revision validator, all four Unicode search forms, copied-token revocation, cleanup, and restoration of the five demo vehicles.

**Code inspected:** scrypt password hashes, signed short-lived JWT cookies, strict schemas, prepared SQL, request IDs, error envelopes, SQLite WAL/synchronous settings, and the absence of a demo-seed fallback in normal startup. Static inspection does not replace threat modeling or penetration testing.

**Hosted-demo limits:** Render Free can take roughly a minute to wake and resets its disposable SQLite database on restart/redeploy or after spin-down. Some SQL-looking search strings can receive an edge-generated 403 before reaching the origin; ordinary searches still reach the parameterized API. These are platform/availability limits of the free demo, not evidence of durable production readiness.

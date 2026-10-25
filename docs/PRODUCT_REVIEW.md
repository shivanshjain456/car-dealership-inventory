# Product and implementation review

Motorline Inventory is a locally runnable dealership-inventory proof of concept.

## Verified product journeys

- A new installation starts with an empty file-backed SQLite database. The first Admin is provisioned through a one-time local interactive CLI; public registration creates Customers only.
- Customers can authenticate, browse/search a paginated catalog, see zero-stock items, and request an atomic one-unit stock decrement.
- Admins can add, replace, restock, and hard-delete vehicles. The API enforces Admin roles. Revision preconditions prevent stale screens from overwriting/deleting newer stock.
- Prices remain attached to ISO currency codes and persist as exact minor units. Search price bounds require a currency and do not compare across currencies.
- The interface distinguishes empty inventory from an empty filtered result. Purchase copy states that no payment is processed; logout and refresh errors do not claim success.

## Audit findings fixed

1. Purchase accepted empty JSON arrays/objects and non-JSON payloads even though the contract requires a bodyless request. The route now rejects nonempty request bodies without changing stock.
2. The hard-delete confirmation advertised itself as modal but did not manage keyboard focus. Focus now moves into the dialog, is contained while open, and returns to a sensible target on dismissal.
3. A single busy-vehicle ID could be overwritten when different inventory requests overlapped, re-enabling the earlier action. Busy state is now tracked per vehicle, with a synchronous duplicate-action guard.

## Reliability and security evidence

**Runtime tested:** authentication and role checks, file-backed persistence, migration upgrade, money validation, search filters, atomic stock update, last-unit concurrency, stale-write conflicts, responsive/browser journeys, and selected accessibility checks.

**Code inspected:** scrypt password hashes, signed short-lived JWT cookies, strict schemas, prepared SQL, request IDs, error envelopes, SQLite WAL/synchronous settings, and the absence of a production demo-seed fallback. Static inspection does not replace threat modeling or penetration testing.
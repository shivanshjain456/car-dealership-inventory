# Product brief

Motorline Inventory is a standalone dealership-inventory application. Staff enter and manage their own vehicle records in a persistent local SQLite database; a fresh installation starts empty. The public Render link is a separate free evaluation deployment whose disposable database is reseeded with a demo Admin and five synthetic vehicles at process start.

## People and jobs

- **Customer:** register/sign in, scan the current inventory, narrow by make/model/category/price in a chosen currency, and request a one-unit stock update. A zero-stock vehicle remains visible, clearly marked unavailable, and cannot be purchased. The action decrements stock only; it does not charge, hold, or create a purchase-history record.
- **Admin:** sign in, create/update vehicles, restock, and hard-delete inventory. The server enforces role checks; updates/deletes also require the version the Admin reviewed, so stale writes cannot replace or delete a newer stock state.
- **First operator:** run the one-time local Admin bootstrap and add the first vehicle through the UI. There is no public Admin registration or hidden default account.

## Scope boundaries

- The catalog and stock are persisted in file-backed SQLite.
- Prices carry an ISO currency code; price-range search never mixes currencies.
- Purchases atomically decrement stock by one. There is no payment, order, purchase-history, FX, or customer account-management feature.
- Public registration creates customers only. The first Admin is provisioned through a local one-time CLI.
- A new local database is empty. Normal startup has no demo seed or synthetic-data fallback; synthetic records stay in test fixtures. Only the explicit hosted-demo start command reuses those fixtures, and its accounts and inventory changes disappear when the free service restarts or spins down.

## Experience mode

This is an **Operate** surface: the user is trying to find or manage a vehicle. Prioritize scanability, clear availability, understandable filters, safe actions, accessible forms, and compact feedback over a marketing hero or decorative metrics.

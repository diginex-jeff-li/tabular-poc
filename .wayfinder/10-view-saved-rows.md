# Ticket 10: View saved rows — load from backend on page open

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

After saving rows, the admin should be able to see all saved rows when they reload the page or click a "Load" button. Currently the mock backend (`mockBulkSave()`) validates but doesn't persist — the data disappears on reload.

### What to build

Two options depending on Jeff's preference:

**(a) In-memory persistence (FE-only)** — The mock backend function stores saved rows in a module-level array. On page load (or "Load" button click), the grid fetches from this in-memory store and displays all previously saved rows. No backend needed, no Docker.

**(b) Real backend (NestJS in-memory store)** — The Ticket 04 backend already has an in-memory store with seeded sample data. On page load, the grid calls `GET /compliance-library` via the oRPC client. Requires Docker (PostgreSQL + Redis) for the NestJS server to start. Shows ~100 seeded sample rows on first load.

### Acceptance criteria (either option)

- On page load (or "Load" button click), previously saved rows appear in the grid
- Rows loaded from the store are NOT marked as dirty (they're already saved)
- Editing a loaded row marks it as `'modified'` in dirty tracking
- Deleting a loaded row marks it as `'deleted'` (not removed from store until Save)
- Save only sends the diff (upserts + deletes), not the full grid

### Recommendation

(a) is simpler for the prototype — no Docker, no network, no oRPC client wiring. But (b) proves the real backend integration which is closer to production.

## Blocked by

(none — frontier ticket)
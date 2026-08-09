# Ticket 4: Mock backend bulk-save endpoint

> **Label:** `wayfinder:task`
> **Type:** Task (AFK)
> **Status:** In progress — subagent running

## Question

Create a mock NestJS controller with in-memory store for the compliance library. Follow the boilerplate's `item` domain pattern (`bp-backend/apps/api/src/item/`) but use an in-memory array instead of TypeORM.

### Endpoints

- **`GET /compliance-library`** — return all rows from in-memory store.
- **`PUT /compliance-library/bulk`** — accept `BulkSaveRequestSchema` (`{ upserts, deletes }`):
  1. Validate each upsert row with `ComplianceLibrarySchema` (from Ticket 3).
  2. Collect validation errors as `{ row, field, message }`.
  3. If any errors: return `{ errors, saved: 0 }` — **reject all** (atomic, no partial save).
  4. If no errors: apply deletes (remove by ID), apply upserts (insert new, update existing by ID). Return `{ errors: [], saved: upserts.length + deletes.length }`.

### In-memory store

```ts
// Simple array, seeded on startup with the sample spreadsheet data
const store: ComplianceLibraryEntity[] = [];
```

Seed with the ~100 rows from `Sample library.xlsx` on module init. Assign UUIDs to seeded rows.

### Wiring

- Controller uses `@Implement` from `@orpc/nest` to wire oRPC contract procedures (same pattern as `item` controller).
- No TypeORM entity, no migration, no repository — just the in-memory array.
- Validate using the Zod schema from `bp-contracts` (same as the frontend uses).

### Atomicity

The save is all-or-nothing: if any row fails Zod validation, the entire batch is rejected. The frontend displays the errors per-cell so the admin can fix and re-save. This matches the "admin reference data, single editor" model — no partial states.

## Blocked by

- Ticket 3 (Zod compliance schema — need the schema to validate against)
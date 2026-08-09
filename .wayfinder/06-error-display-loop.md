# Ticket 6: Validation error display loop

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — blocked

## Question

Wire the core save loop that the prototype must prove. This is the critical UX path — the reason the prototype exists.

### The loop

1. Admin pastes 100 rows from Excel into the grid (Ticket 2).
2. Admin clicks "Save".
3. Frontend builds the diff payload from dirty tracking (Ticket 7): `{ upserts: [...], deletes: [...] }`.
4. Frontend POSTs to mock backend (Ticket 4): `PUT /compliance-library/bulk`.
5. Backend validates each row with Zod, returns `{ errors: [{ row, field, message }], saved: 0 }` if any fail.
6. Frontend maps errors back to grid cells:
   - For each `{ row, field, message }`, find the corresponding Tabulator cell.
   - Apply `tabulator-validation-fail` CSS class (or custom error styling).
   - Optionally show the error message in a tooltip or a sidebar error list.
7. Admin sees which cells failed, fixes them in the grid.
8. Admin clicks "Save" again → re-validates → either more errors or `{ errors: [], saved: N }`.
9. On success: clear all dirty tracking (Ticket 7), show success toast.

### Error display design

The error display must be **per-cell** — not a toast, not a modal, not a console log. The admin needs to see exactly which cell in which row failed. Options:

- **(a) Tabulator built-in**: `validationMode: 'highlight'` applies `tabulator-validation-fail` CSS class. Style it red. But this only works for Tabulator's built-in validators, not backend Zod errors.
- **(b) Custom cell styling**: After receiving backend errors, programmatically add a CSS class to the specific Tabulator cell via the Cell Component API: `cell.getElement().classList.add('backend-validation-error')`.
- **(c) Error sidebar**: A panel beside the grid listing all errors as clickable links — click an error → scrolls to and highlights the corresponding cell.

Recommend **(b) + (c)**: highlight invalid cells red + an error sidebar listing `{ row 3, Risk Level: "Critical" is not a valid value }` with click-to-scroll.

### Acceptance criteria

- Paste 100 rows with 2 invalid cells (e.g., `Risk Level = "Critical"`, missing `Issue`).
- Click Save → 2 cells highlighted red, error sidebar shows 2 entries.
- Fix both cells → click Save → success toast, dirty tracking cleared.
- This is the loop the prototype must demonstrate end-to-end.

## Blocked by

- Ticket 2 (Tabulator TSX spike)
- Ticket 3 (Zod compliance schema)
- Ticket 4 (Mock backend)
- Ticket 7 (Dirty tracking)
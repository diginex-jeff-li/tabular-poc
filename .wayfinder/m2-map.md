# M2 Wayfinder Map — Custom Table Builder

## Destination

Extend the sc-tabulator prototype with user-defined custom tables. Users can
create their own table structures (column name, type, choices, required),
fill them via paste or manual entry, and save to localStorage. The M1
compliance library is refactored to share the same grid engine.

## Decisions (from grilling)

| Q | Decision |
|---|---|
| Q1 | Any user can create (no auth, prototype) |
| Q2 | localStorage persistence (no backend) |
| Q3 | Text + Dropdown + Number field types |
| Q4 | Add columns only after data exists (no rename/delete/type-change) |
| Q5 | Shared engine, different entry (`/` hardcoded, `/custom` runtime) |
| Q6 | List view of tables + "New Table" button |
| Q7 | Column builder on dedicated page `/custom/new` |
| Q8 | Build Zod at runtime from column definition |
| Q9 | Automatic hidden UUID per row |
| Q10 | Paste maps by position (extra dropped, missing padded) |
| Q11 | Delete table + all data with confirmation |
| Q12 | All M1 features (paste, add, delete, save, validation, filters, export, full-screen) |
| Q13 | Mini table using Nuxt UI table component for column builder |
| Q14 | Number = just a number, no min/max constraints |
| Q15 | Required toggle per column (all types) |
| Q16 | Refactor M1 into shared engine (GridEditor component + useGridEditor composable) |
| Q17 | Component + composable structure |

## Spec

See `spec-m2.md` for interface contracts (GridEditor props, useGridEditor
returns, localStorage schema, route structure, runtime Zod builder).

## Tickets

### 01 — Extract GridEditor + useGridEditor (refactor M1)
Extract the grid logic + render from ComplianceGridEditor.tsx into:
- `composables/useGridEditor.ts` — dirty tracking, paste, save loop, errors
- `components/GridEditor.tsx` — full-screen grid + toolbar + error sidebar + empty-state
M1's page becomes a thin wrapper passing hardcoded Zod columns + mock save.
Blocked by: nothing (frontier)
Acceptance: M1 page works identically after refactor. All 24 existing tests pass.

### 02 — Runtime Zod builder
`composables/buildRuntimeSchema.ts` — converts ColumnDef[] → z.ZodObject.
Maps: text→z.string(), dropdown→z.enum(choices), number→z.number(),
required→no .nullable(), optional→.nullable(). Includes id/createdAt/updatedAt.
TDD: write tests first (valid row passes, invalid type fails, missing required fails, nullable passes empty).
Blocked by: nothing (frontier)
Acceptance: tests pass, builds valid Zod from definition.

### 03 — definitionToColumns
`composables/definitionToColumns.ts` — converts ColumnDef[] → Tabulator column defs.
Same pattern as zodToTabulatorColumns but from definition, not Zod.
Includes checkbox column (clipboard:false), header filters, editors per type.
Blocked by: nothing (frontier)
Acceptance: returns valid Tabulator columns with correct editors + validators.

### 04 — Column builder page (`/custom/new`)
Nuxt UI table with columns: Column Name | Type | Required | Choices.
- Type = dropdown (Text/Dropdown/Number)
- Required = checkbox
- Choices = comma-separated input (visible only when type=Dropdown)
- "Add Column" row at bottom
- "Create Table" button → saves definition to localStorage → redirect to /custom/:tableId
Blocked by: 02, 03 (needs the types they define)
Acceptance: user can create a table definition, it persists in localStorage.

### 05 — Custom table list page (`/custom`)
Lists all table definitions from localStorage as cards.
- Shows: table name, column count, row count, last modified
- "New Table" button → /custom/new
- Click table → /custom/:tableId
- Delete button per card → confirmation modal → removes definition + data
Blocked by: nothing (frontier, can use stub localStorage)
Acceptance: list renders, delete works, navigation works.

### 06 — Custom table editor page (`/custom/:tableId`)
Reads definition from localStorage → builds Zod (02) → builds columns (03) →
renders <GridEditor> with runtime schema validation.
Save handler: validates with runtime Zod, persists to localStorage.
Paste handler: same custom clipboardPasteParser as M1 (skip checkbox column).
Blocked by: 01 (GridEditor), 02 (runtime Zod), 03 (definitionToColumns)
Acceptance: full grid editor works — paste, add row, delete, save, validation,
filters, export, empty-state, full-screen. Data persists across reloads.

## Dependency graph

```
01 (extract GridEditor) ─────────────────────────┐
02 (runtime Zod) ──────────┬──────────────────────┤
03 (definitionToCols) ─────┤                      │
                           ├──► 04 (builder page) │
                           │                      ├──► 06 (custom editor)
                           │                      │
05 (list page) ────────────┘ (independent) ───────┘
```

Frontier: 01, 02, 03, 05 (all unblocked).
04 blocked by 02+03. 06 blocked by 01+02+03.
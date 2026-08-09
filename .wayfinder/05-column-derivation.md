# Ticket 5: Grid column derivation from Zod schema

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — blocked

## Question

Derive Tabulator column definitions from the Zod schema — the "single source of truth" bridge. Create a function that takes a Zod object schema and returns Tabulator column definitions, so the grid renders from the contract, not from hardcoded column config.

### Derivation rules

| Zod type | Tabulator column config |
|---|---|
| `z.string().uuid()` (id) | `{ visible: false, editable: false }` — hidden, not editable |
| `z.enum([...])` | `{ editor: 'select', editorParams: { values: enumValues }, validator: { type: 'in', parameters: enumValues.join('|') } }` |
| `z.string()` (required) | `{ editor: 'input', validator: 'required' }` |
| `z.string().nullable()` | `{ editor: 'input' }` — no `required` validator |
| `z.string().datetime()` (audit) | `{ visible: false, editable: false }` — hidden |
| `z.number()` | `{ editor: 'number', validator: 'numeric' }` |

### Implementation

```ts
function zodToTabulatorColumns(schema: ZodObject): ColumnDefinition[] {
  // Iterate schema.shape, map each field to a Tabulator column def
  // Use the field name as the column `field`
  // Use a human-readable title (can be derived from field name or a separate metadata map)
}
```

### Acceptance criteria

- Pass `ComplianceLibrarySchema` → get back 8 visible columns (id + audit columns hidden) with correct editors and validators.
- Changing the Zod schema (e.g., adding a new enum value to `riskLevel`) automatically updates the grid's select editor options — no FE code change needed.

## Blocked by

- Ticket 2 (Tabulator TSX spike — need the grid working first)
- Ticket 3 (Zod compliance schema — need the schema to derive from)
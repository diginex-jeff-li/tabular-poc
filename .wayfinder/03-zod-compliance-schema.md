# Ticket 3: Zod compliance schema in bp-contracts

> **Label:** `wayfinder:task`
> **Type:** Task (AFK)
> **Status:** Closed — resolved 2026-08-10

## Question

Define the Zod schema for the compliance library in `bp-contracts/src/compliance-library/schemas/`. Follow the existing `item` domain pattern (`bp-contracts/src/item/schemas/index.ts`).

### Schemas to define

**`ComplianceLibrarySchema`** — the row entity. Column types depend on Ticket 1's key model decision, but the shape is:

```ts
export const ComplianceLibrarySchema = z.object({
  id: z.string().uuid(),                    // or natural key per Ticket 1
  categoryCode: z.string(),                  // enum or pattern per Ticket 1
  complianceCategory: z.enum(['Governance', 'Social', 'Environment']),
  topic: z.string(),
  riskLevel: z.enum(['High', 'Medium', 'Low']),
  issue: z.string(),
  closureTiming: z.string(),                 // mixed type — see note below
  evidenceExpectation: z.string().nullable(),
  bestPractice: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

**`closureTiming` design note** — sample data has values: `7`, `30`, `60`, `90` (days as numbers) and `Next assessment` (string). Options:
- `z.enum(['7', '30', '60', '90', 'Next assessment'])` — simplest, all string
- `z.union([z.number(), z.literal('Next assessment')])` — preserves numeric type
- `z.string()` with custom validator — flexible but loose

Recommend `z.enum([...])` — the values are a fixed set, and string representation is how they appear in Excel.

**`BulkSaveRequestSchema`** — the diff-based upsert payload:

```ts
export const BulkSaveRequestSchema = z.object({
  upserts: ComplianceLibrarySchema.omit({ createdAt: true, updatedAt: true }).array(),
  deletes: z.string().uuid().array(),
});
```

**`BulkSaveResponseSchema`** — the save result with row-level errors:

```ts
export const BulkSaveErrorSchema = z.object({
  row: z.number(),          // row index in the upserts array
  field: z.string(),        // column field name
  message: z.string(),     // validation error message
});

export const BulkSaveResponseSchema = z.object({
  errors: BulkSaveErrorSchema.array(),
  saved: z.number(),
});
```

### Routes

Also define in `bp-contracts/src/compliance-library/routes/index.ts`:

```ts
listComplianceLibrary: GET /compliance-library → ComplianceLibrarySchema[]
bulkSaveComplianceLibrary: PUT /compliance-library/bulk → BulkSaveRequestSchema → BulkSaveResponseSchema
```

### Rebuild reminder

After changing contracts: `pnpm --filter bp-contracts build` before running backend or frontend (both import from `dist/`).

## Blocked by

- Ticket 1 (entity/key model — need the key definition before schema)
# Ticket 1: Entity/key model for compliance library

> **Label:** `wayfinder:grilling`
> **Type:** Grilling (HITL)
> **Status:** Closed — resolved 2026-08-09

## Question

What is the natural/primary key for the compliance library entity? The sample spreadsheet has `Category Code` (A–Q) but that's not unique per row — multiple rows share the same code (e.g., rows 3–9 are all `A`). Production data has a unique ID per row (Jeff confirmed in grilling Round 2).

Define:

1. **Primary key** — UUID (backend-generated)? Auto-increment? Natural composite key?
2. **Unique constraint** — what combination of columns is unique? `Category Code + Issue`? `Category Code + Topic + Issue`? Or is uniqueness not enforced at the DB level (admin-curated, duplicates allowed)?
3. **Editable vs read-only** — which columns can the admin edit? All 8? Or is `Category Code` a stable identifier that shouldn't change once set?
4. **Column types for Zod** — map each of the 8 columns:
   - `Category Code` — enum (A–Q) or free string with pattern?
   - `Compliance Category` — enum (`Governance`, `Social`, `Environment`)?
   - `Topic / Section` — free string or enum? (sample has ~15 distinct values)
   - `Risk Level` — enum (`High`, `Medium`, `Low`)
   - `Issue / Requirement` — free string (long text)
   - `Closure / Remediation Timing` — mixed type: `7`, `30`, `60`, `90` (numbers as days) or `Next assessment` (string). Enum? Union?
   - `Evidence / Verification Expectation` — free string, nullable
   - `Best Practice / Guidance` — free string, nullable
5. **Audit columns** — `createdAt`, `updatedAt`, `deletedAt` (soft delete)?

This is a grilling ticket — needs Jeff's decision on the key model before the Zod schema (Ticket 3) can be defined.

## Resolution

All five questions answered (a) on 2026-08-09:

1. **Primary key**: Backend-generated UUID — `id: z.string().uuid()`, assigned on insert. Pasted rows get UUIDs on save.
2. **Unique constraint**: None beyond the primary key. Admin-curated reference data; duplicates allowed. Dedup, if needed, is a soft UI warning, not a DB constraint.
3. **Editable columns**: All 8 editable. With UUID PKs, no referential integrity risk from editing any column.
4. **`closureTiming` type**: `z.enum(['7', '30', '60', '90', 'Next assessment'])` — all strings, matches Excel representation and Tabulator select editor.
5. **`topic` type**: `z.enum([...])` — closed set of 14 values from the sample. New topics require a schema change.

### Locked Zod column types

```ts
export const ComplianceLibrarySchema = z.object({
  id: z.string().uuid(),
  categoryCode: z.enum(['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q']),
  complianceCategory: z.enum(['Governance', 'Social', 'Environment']),
  topic: z.enum([
    'Key Compliance Requirements', 'Zero Tolerance Policy', 'Freedom of Association',
    'Recruitment & Fees', 'Forced & Compulsory Labour', 'Wages & Benefits',
    'Working Hours', 'Occupational Safety & Health', 'Environmental Responsibility',
    'Grievance Mechanisms', 'Discrimination', 'Business Integrity',
    'Compliance Requirements', 'Community & Environment',
  ]),
  riskLevel: z.enum(['High', 'Medium', 'Low']),
  issue: z.string(),
  closureTiming: z.enum(['7', '30', '60', '90', 'Next assessment']),
  evidenceExpectation: z.string().nullable(),
  bestPractice: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

## Blocked by

(none — frontier ticket)
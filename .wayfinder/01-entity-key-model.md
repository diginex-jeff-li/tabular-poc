# Ticket 1: Entity/key model for compliance library

> **Label:** `wayfinder:grilling`
> **Type:** Grilling (HITL)
> **Status:** Open — frontier ticket

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

## Blocked by

(none — frontier ticket)
import { RESERVED_COLUMN_NAMES } from 'src/types/customTable';

/**
 * Shared column-validation helpers used by both the column builder
 * (`/custom/new`) and the post-creation Add Column modal in the custom table
 * editor. Extracted so the two surfaces enforce identical rules rather than
 * duplicating the logic — see architecture.md section 4.4 and the b6 builder
 * validation rules.
 *
 * The reserved-name list lives in `src/types/customTable.ts` and is the single
 * source of truth for both surfaces.
 */

/**
 * Parse a comma-separated choices string: split on ',', trim, drop empties.
 * "a, ,b," → ["a", "b"].
 */
export function parseChoices(raw: string): Array<string> {
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * True when `name` (trimmed, case-insensitive) matches one of the reserved
 * column names (`id`, `createdAt`, `updatedAt`, `__select`). An empty name is
 * not reserved — it is caught by the empty-name rule instead.
 */
export function isReservedName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  return RESERVED_COLUMN_NAMES.some((r) => r.toLowerCase() === lower);
}

/**
 * True when `name` (trimmed, case-insensitive) already appears in
 * `existingNames`. Existing names are trimmed and lowercased before the
 * comparison so trailing whitespace and case variants collide. An empty
 * `name` is never a duplicate — the empty-name rule catches it first.
 */
export function isDuplicateName(
  name: string,
  existingNames: Array<string>,
): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  return existingNames.some((n) => n.trim().toLowerCase() === lower);
}

/**
 * True when `raw` parses to at least one non-empty choice. Used to reject a
 * Dropdown column whose choices input is empty or contains only commas and
 * spaces.
 */
export function hasValidChoices(raw: string): boolean {
  return parseChoices(raw).length > 0;
}

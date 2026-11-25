import { TableDefinitionSchema, TableRowSchema } from 'src/types/customTable';
import { z } from 'zod';
import type { TableDefinition, TableRow } from 'src/types/customTable';

/**
 * The key under which a single table's row data is stored.
 *
 * @param tableId — the table definition's uuid id
 */
export function tableDataKey(tableId: string): string {
  return `sc-table-data-${tableId}`;
}

/**
 * Parse the raw `sc-table-defs` payload into a validated array of
 * TableDefinitions. Corruption tolerance is a hard requirement:
 * malformed JSON, a non-array payload, or entries failing their Zod
 * schema must yield an empty array (or drop just the bad entries) and
 * must never throw. A single `console.warn` per problem is acceptable.
 */
export function parseTableDefinitions(
  raw: string | null,
): Array<TableDefinition> {
  if (raw === null) {
    return [];
  }
  return parseArray(raw, TableDefinitionSchema);
}

/**
 * Parse the raw `sc-table-data-{tableId}` payload into a validated array
 * of TableRows. The same corruption tolerance as parseTableDefinitions
 * applies: malformed JSON, a non-array payload, or entries failing their
 * Zod schema must yield an empty array (or drop just the bad entries) and
 * must never throw.
 */
export function parseTableRows(raw: string | null): Array<TableRow> {
  if (raw === null) {
    return [];
  }
  return parseArray(raw, TableRowSchema);
}

/**
 * Read and parse the rows for a single table from localStorage.
 * Returns an empty array when the key is absent or corrupt — never throws.
 *
 * @param tableId — the table definition's uuid id
 */
export function readTableRows(tableId: string): Array<TableRow> {
  const raw = localStorage.getItem(tableDataKey(tableId));
  return parseTableRows(raw);
}

/**
 * Persist the rows for a single table to localStorage under
 * `sc-table-data-{tableId}`.
 *
 * @param tableId — the table definition's uuid id
 * @param rows — the rows to persist
 */
export function writeTableRows(tableId: string, rows: Array<TableRow>): void {
  localStorage.setItem(tableDataKey(tableId), JSON.stringify(rows));
}

/**
 * Remove the data key for a single table. No-op when the key does not
 * exist. Used by `deleteDefinition` so no data key is orphaned.
 *
 * @param tableId — the table definition's uuid id
 */
export function deleteTableData(tableId: string): void {
  localStorage.removeItem(tableDataKey(tableId));
}

/**
 * Shared corruption-tolerant parser used by both parseTableDefinitions and
 * parseTableRows. Parses the raw string as JSON, validates that it is an
 * array, and filters each entry through the supplied Zod schema, dropping
 * the ones that fail. Any failure along the way yields an empty array (or
 * just the valid entries) and a single `console.warn` — never an exception.
 *
 * Uses `result.data` from the narrowed success branch rather than the raw
 * entry so that any Zod transform (`.default()`, `.transform()`, coercion)
 * is honoured — even though the current schemas have none, future additions
 * would silently lose transformed values if the raw entry were used.
 */
function parseArray<T>(raw: string, schema: z.ZodType<T>): Array<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      '[sc-table] failed to parse stored JSON, returning empty array',
    );
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn(
      '[sc-table] stored payload is not an array, returning empty array',
    );
    return [];
  }

  const valid: Array<T> = [];
  for (const entry of parsed) {
    const result = schema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      console.warn('[sc-table] dropping a schema-invalid entry');
    }
  }
  return valid;
}

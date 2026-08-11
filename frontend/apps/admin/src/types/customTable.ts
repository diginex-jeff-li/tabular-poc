import { z } from 'zod';

/**
 * Reserved column names that must never be used as a user-defined column name.
 * The builder, the add-column modal and the storage layer all validate against
 * this single list. The `__select` entry is the checkbox column's field key;
 * the others are the row metadata fields that every TableRow carries.
 */
export const RESERVED_COLUMN_NAMES = ['id', 'createdAt', 'updatedAt', '__select'] as const;

/**
 * A single column definition in a custom table.
 *
 * `name` is both the display name and the field key rows are keyed by.
 * `choices` is only meaningful for type 'dropdown'.
 */
export const ColumnDefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['text', 'dropdown', 'number']),
  required: z.boolean(),
  choices: z.array(z.string()),
});

export type ColumnDef = z.infer<typeof ColumnDefSchema>;

/**
 * A custom table definition — the schema a user builds in the builder page.
 * Stored under the `sc-table-defs` localStorage key as an array.
 */
export const TableDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  columns: z.array(ColumnDefSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TableDefinition = z.infer<typeof TableDefinitionSchema>;

/**
 * A single row in a custom table. Requires the row metadata fields
 * (id, createdAt, updatedAt) and permits any number of additional keys
 * keyed by column name. The passthrough is what makes rows a bag of
 * column-name → value pairs without declaring every column up front.
 */
export const TableRowSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

export type TableRow = z.infer<typeof TableRowSchema>;

import { z } from 'zod';
import type { ColumnDef } from 'src/types/customTable';

/**
 * Build a Zod object schema from a list of column definitions, per
 * architecture.md section 5.1. Each column is keyed by `col.name`.
 *
 * - text     → z.string() (required implies .min(1))
 * - number   → z.coerce.number() — NOT z.number(). Pasted cells arrive as
 *              strings; non-numeric input coerces to NaN which the number
 *              check rejects. This deliberately deviates from spec-m2.md,
 *              which specifies z.number(); architecture.md is authoritative.
 * - dropdown → z.enum(col.choices)
 *
 * Non-required columns are wrapped to tolerate null, undefined (a missing
 * key on a newly added row) and empty string (a newly pasted or cleared
 * cell), since those are the values such cells arrive with.
 *
 * The returned schema always requires id (uuid), createdAt (datetime) and
 * updatedAt (datetime).
 */
export function buildRuntimeSchema(
  columns: ColumnDef[],
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  };

  for (const col of columns) {
    shape[col.name] = columnSchema(col);
  }

  return z.object(shape);
}

/**
 * The per-column schema. Required columns use the base schema directly;
 * non-required columns are wrapped to also accept null, undefined and the
 * empty string.
 */
function columnSchema(col: ColumnDef): z.ZodTypeAny {
  const base = baseSchema(col);
  if (col.required) {
    return base;
  }
  // Map the empty string and undefined (a missing key) to null, then let
  // .nullable() accept it. This is what lets newly added and newly pasted
  // cells — which arrive as undefined or '' — pass validation.
  return z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    base.nullable(),
  );
}

function baseSchema(col: ColumnDef): z.ZodTypeAny {
  switch (col.type) {
    case 'text':
      return col.required ? z.string().min(1) : z.string();
    case 'number':
      return z.coerce.number();
    case 'dropdown':
      return z.enum(col.choices as [string, ...string[]]);
  }
}

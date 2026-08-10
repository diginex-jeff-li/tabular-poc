import { z } from 'zod';
import type { ColumnDefinition } from 'tabulator-tables';

/**
 * Derives Tabulator column definitions from a Zod object schema.
 *
 * Mapping rules:
 * - z.enum() → { editor: 'list', editorParams: { values }, validator: ['required', { type: 'in', parameters }] }
 * - z.string().uuid() / z.string().datetime() → hidden (visible: false, editable: false)
 * - z.string() (required) → { editor: 'input', validator: 'required' }
 * - z.string().nullable() → { editor: 'input' } (no required validator)
 *
 * Hidden fields (uuid, datetime) are excluded from the output entirely.
 */
export function zodToTabulatorColumns(
  schema: z.ZodObject<z.ZodRawShape>,
): ColumnDefinition[] {
  const shape = schema.shape;
  const columns: ColumnDefinition[] = [];

  for (const [key, type] of Object.entries(shape)) {
    const column = deriveColumn(key, type as z.ZodTypeAny);
    if (column) {
      columns.push(column);
    }
  }

  return columns;
}

function deriveColumn(
  field: string,
  type: z.ZodTypeAny,
): ColumnDefinition | null {
  // Unwrap nullable
  let innerType = type;
  let isNullable = false;

  if (innerType instanceof z.ZodNullable) {
    isNullable = true;
    innerType = innerType._def.innerType;
  }

  // Unwrap optional
  if (innerType instanceof z.ZodOptional) {
    innerType = innerType._def.innerType;
  }

  // Enum → list editor
  if (innerType instanceof z.ZodEnum) {
    const values = innerType._def.values as string[];
    return {
      title: fieldToTitle(field),
      field,
      editor: 'list',
      editorParams: { values },
      validator: [
        'required',
        { type: 'in', parameters: values.join('|') },
      ],
    } as ColumnDefinition;
  }

  // String
  if (innerType instanceof z.ZodString) {
    const checks = innerType._def.checks;

    // uuid or datetime → hidden
    if (checks.some((c: { kind: string }) => c.kind === 'uuid' || c.kind === 'datetime')) {
      return null; // exclude from visible columns
    }

    // Regular string
    const col: Record<string, unknown> = {
      title: fieldToTitle(field),
      field,
      editor: 'input',
    };

    if (!isNullable) {
      col.validator = 'required';
    }

    return col as unknown as ColumnDefinition;
  }

  // Unknown types: skip
  return null;
}

function fieldToTitle(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

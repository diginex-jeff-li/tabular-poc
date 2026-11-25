import { z } from 'zod';
import type { ColumnDefinition } from 'tabulator-tables';

/**
 * Derives Tabulator column definitions from a Zod object schema.
 *
 * Mapping rules:
 * - z.enum() → { editor: 'list', editorParams: { values }, validator: ['required', { type: 'in', parameters }] }
 *   (a nullable enum drops 'required'; Tabulator's 'in' accepts empty cells)
 * - z.string() with its own rules (email, min, max, regex…) → adds a
 *   validator that runs that same Zod string on non-empty cells, so the
 *   in-cell highlight and the save check never disagree
 * - z.string().uuid() / z.string().datetime() → hidden (visible: false, editable: false)
 * - z.string() (required) → { editor: 'input', validator: 'required' }
 * - z.string().nullable() → { editor: 'input' } (no required validator)
 *
 * `titles` overrides the title derived from a field name.
 * Hidden fields (uuid, datetime) are excluded from the output entirely.
 */
export function zodToTabulatorColumns(
  schema: z.ZodObject<z.ZodRawShape>,
  options: { titles?: Readonly<Record<string, string>> } = {},
): ColumnDefinition[] {
  const shape = schema.shape;
  const columns: ColumnDefinition[] = [];

  for (const [key, type] of Object.entries(shape)) {
    const title = options.titles?.[key] ?? fieldToTitle(key);
    const column = deriveColumn(key, type as z.ZodTypeAny, title);
    if (column) {
      columns.push(column);
    }
  }

  return columns;
}

// Blank cells are the required check's job; anything else must pass the
// field's own Zod string.
function schemaValidator(type: z.ZodString) {
  return {
    type: (_cell: unknown, value: unknown) =>
      value === null ||
      value === undefined ||
      value === '' ||
      type.safeParse(value).success,
  };
}

function deriveColumn(
  field: string,
  type: z.ZodTypeAny,
  title: string,
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
      title,
      field,
      editor: 'list',
      editorParams: { values },
      // VAL-GRID-021: tristate sort cycle asc → desc → none (clears on 3rd click)
      headerSortTristate: true,
      validator: [
        ...(isNullable ? [] : ['required']),
        { type: 'in', parameters: values.join('|') },
      ],
    } as ColumnDefinition;
  }

  // String
  if (innerType instanceof z.ZodString) {
    const checks = innerType._def.checks;

    // uuid or datetime → hidden
    if (
      checks.some(
        (c: { kind: string }) => c.kind === 'uuid' || c.kind === 'datetime',
      )
    ) {
      return null; // exclude from visible columns
    }

    // Regular string
    const col: Record<string, unknown> = {
      title,
      field,
      editor: 'input',
      // VAL-GRID-021: tristate sort cycle asc → desc → none (clears on 3rd click)
      headerSortTristate: true,
    };

    const validators: unknown[] = [];
    if (!isNullable) validators.push('required');
    if (checks.length > 0) validators.push(schemaValidator(innerType));
    if (validators.length === 1) col.validator = validators[0];
    else if (validators.length > 1) col.validator = validators;

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

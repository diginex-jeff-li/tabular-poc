import type { Row } from 'composables/useDataGrid';
import type { VNode } from 'vue';
import type { z } from 'zod';

/**
 * One grid column, kept apart from `UTable`'s column type. `DataGrid` maps it
 * to a `UTable` column; validation, paste, CSV and range logic read it
 * directly.
 */
export type GridColumn = {
  id: string;
  title: string;
  /** The message for an invalid value, or null when the value is valid. */
  validate: (value: unknown) => string | null;
  /** Takes a position when pasted rows are parsed. */
  paste: boolean;
  /** Included in CSV export. */
  export: boolean;
  /** Fixed width in px. */
  width?: number;
  /** Stays at the left edge while the grid scrolls sideways. */
  pinned?: boolean;
} & (
  | { editor: 'choice'; options: ReadonlyArray<string>; filter: 'choice' }
  | { editor: 'text'; filter: 'text' }
  | {
      editor: null;
      filter: null;
      /**
       * Renders the cell instead of the row's value; the column can't be
       * sorted. Re-runs when the row changes and when errors are shown
       * (`GridApi.showErrors`), so it may show state kept outside the row.
       */
      render?: (row: Row) => VNode;
    }
);

/**
 * Derives grid columns from a Zod object schema, field order kept.
 *
 * - z.enum() → choice editor and filter over its options. A blank cell is
 *   required unless the enum is nullable; any other value must be an option.
 * - z.string() → text editor and filter. A blank cell is required unless the
 *   string is nullable; any other value must pass the field's own Zod string
 *   (email, min, max, regex…), so the cell check and the save check agree.
 * - z.string().uuid() / z.string().datetime() → no column.
 * - Other types → no column.
 *
 * `titles` overrides the title derived from a field name.
 */
export function zodToColumnDefs(
  schema: z.ZodObject,
  options: { titles?: Readonly<Record<string, string>> } = {},
): Array<GridColumn> {
  return Object.entries(schema.shape).flatMap(([id, type]) => {
    const title = options.titles?.[id] ?? fieldToTitle(id);
    const column = deriveColumn(id, title, type as z.ZodType);
    return column ? [column] : [];
  });
}

function deriveColumn(
  id: string,
  title: string,
  type: z.ZodType,
): GridColumn | null {
  // Schema kinds come from `_zod.def.type`, which (unlike instanceof) also
  // holds when two copies of zod are installed.
  let inner = type;
  const nullable = inner._zod.def.type === 'nullable';
  if (nullable) {
    inner = (inner as z.ZodNullable).unwrap() as z.ZodType;
  }
  if (inner._zod.def.type === 'optional') {
    inner = (inner as z.ZodOptional).unwrap() as z.ZodType;
  }
  const kind = deriveKind(inner);
  if (!kind) {
    return null;
  }
  const { rule, ...editing } = kind;
  const blank = nullable ? null : 'Required';
  return {
    id,
    title,
    paste: true,
    export: true,
    ...editing,
    validate: (value) =>
      value === null || value === undefined || value === ''
        ? blank
        : rule(value),
  };
}

/** Editor and filter for a field, and its rule for a non-blank value. */
function deriveKind(type: z.ZodType) {
  if (type._zod.def.type === 'enum') {
    const options = (type as z.ZodEnum).options as Array<string>;
    const invalid = `Must be one of: ${options.join(', ')}`;
    return {
      editor: 'choice',
      options,
      filter: 'choice',
      rule: (value: unknown) =>
        options.includes(value as string) ? null : invalid,
    } as const;
  }
  const string = type as z.ZodString;
  if (
    type._zod.def.type !== 'string' ||
    string.format === 'uuid' ||
    string.format === 'datetime'
  ) {
    return null;
  }
  return {
    editor: 'text',
    filter: 'text',
    rule: (value: unknown) => {
      const result = string.safeParse(value);
      return result.success
        ? null
        : (result.error.issues[0]?.message ?? 'Invalid value');
    },
  } as const;
}

function fieldToTitle(field: string): string {
  return field
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

import type { ColumnDef } from 'src/types/customTable';

/**
 * Derive Tabulator column definitions from a list of custom-table column
 * definitions, per architecture.md section 5.2.
 *
 * The `__select` checkbox column is emitted FIRST with `clipboard: false` —
 * that flag is what makes the shared engine's positional paste parser skip it
 * (the parser filters by `c.clipboard !== false && c.visible !== false`).
 * One column per definition follows, in definition order.
 *
 * The shape mirrors `buildComplianceColumns` / `zodToTabulatorColumns` so the
 * shared engine treats runtime-derived and Zod-derived columns identically.
 *
 * Column mappings:
 * - text     → editor 'input', headerFilter 'input', validator 'required' when required
 * - number   → editor 'number', headerFilter 'input', validator 'required' when required,
 *              plus a coercing mutator so pasted string values become numbers
 * - dropdown → editor 'list' with editorParams.values = choices,
 *              headerFilter 'list' with headerFilterParams { values, clearable: true },
 *              validator ['required', { type: 'in', parameters }] when required, just
 *              the 'in' validator when optional
 */
export function definitionToColumns(
  columns: Array<ColumnDef>,
): Array<Record<string, unknown>> {
  const checkboxColumn: Record<string, unknown> = {
    field: '__select',
    clipboard: false,
    formatter: 'rowSelection',
    titleFormatter: 'rowSelection',
    hozAlign: 'center',
    headerSort: false,
    width: 40,
  };

  return [checkboxColumn, ...columns.map(columnDefToTabulatorColumn)];
}

function columnDefToTabulatorColumn(col: ColumnDef): Record<string, unknown> {
  switch (col.type) {
    case 'text':
      return textColumn(col);
    case 'number':
      return numberColumn(col);
    case 'dropdown':
      return dropdownColumn(col);
  }
}

function textColumn(col: ColumnDef): Record<string, unknown> {
  const column: Record<string, unknown> = {
    title: col.name,
    field: col.name,
    editor: 'input',
    headerFilter: 'input',
    headerSortTristate: true,
  };
  if (col.required) {
    column.validator = 'required';
  }
  return column;
}

function numberColumn(col: ColumnDef): Record<string, unknown> {
  const column: Record<string, unknown> = {
    title: col.name,
    field: col.name,
    editor: 'number',
    headerFilter: 'input',
    headerSortTristate: true,
    mutator: coerceNumber,
  };
  if (col.required) {
    column.validator = 'required';
  }
  return column;
}

function dropdownColumn(col: ColumnDef): Record<string, unknown> {
  const choices = col.choices;
  const column: Record<string, unknown> = {
    title: col.name,
    field: col.name,
    editor: 'list',
    editorParams: { values: choices },
    headerFilter: 'list',
    headerFilterParams: { values: choices, clearable: true },
    headerSortTristate: true,
  };

  if (col.required) {
    column.validator = [
      'required',
      { type: 'in', parameters: choices.join('|') },
    ];
  } else {
    column.validator = [{ type: 'in', parameters: choices.join('|') }];
  }

  return column;
}

/**
 * Coerce a pasted string value to a number so the cell carries a typed value
 * rather than a numeric string. Non-numeric strings are left untouched — the
 * runtime Zod schema (z.coerce.number()) rejects them downstream.
 */
function coerceNumber(value: unknown): unknown {
  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  return value;
}

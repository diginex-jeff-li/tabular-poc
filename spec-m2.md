# M2 Spec: Custom Table Builder

## GridEditor Component Interface

```typescript
// components/GridEditor.tsx
props: {
  columns: Record<string, unknown>[]    // Tabulator column definitions
  data: Record<string, unknown>[]       // Initial row data
  onSave: (payload: { upserts: Record<string, unknown>[]; deletes: string[] }) => Promise<{ errors: BackendError[]; saved: number }>
  title: string                         // Toolbar title
}
// No slots, no events beyond onSave.
// Internal: dirty tracking, paste parser, error highlighting, empty-state overlay,
// full-screen layout, toolbar (Add Row, Save, Delete, Export, Clear), licensing slide-over.

// composables/useGridEditor.ts
function useGridEditor(opts: {
  columns: Ref<Record<string, unknown>[]>
  data: Ref<Record<string, unknown>[]>
  onSave: (payload: { upserts: Record<string, unknown>[]; deletes: string[] }) => Promise<{ errors: BackendError[]; saved: number }>
}): {
  tabulator: ShallowRef<TabulatorFull | null>
  rowCount: Ref<number>
  dirtyCount: Ref<number>
  isSaving: Ref<boolean>
  errorList: Ref<BackendError[]>
  saveResult: Ref<SaveResponse | null>
  handleAddRow: () => void
  handleSave: () => Promise<void>
  handleDeleteSelected: () => void
  handleExportCSV: () => void
  clearGrid: () => void
  scrollToError: (err: BackendError) => void
}
```

## localStorage Schema

```typescript
// Table definition — stored under key `sc-table-defs` as an array
interface TableDefinition {
  id: string                           // crypto.randomUUID()
  name: string                         // user-provided table name
  columns: ColumnDef[]
  createdAt: string                    // ISO datetime
  updatedAt: string
}

interface ColumnDef {
  id: string                           // crypto.randomUUID()
  name: string                         // column display name (also the field key)
  type: 'text' | 'dropdown' | 'number'
  required: boolean
  choices: string[]                    // only for type='dropdown'
}

// Table data — stored under key `sc-table-data-{tableId}` as an array
interface TableRow {
  id: string                           // crypto.randomUUID(), hidden in grid
  [columnName: string]: unknown        // keyed by ColumnDef.name
  createdAt: string
  updatedAt: string
}
```

## Route Structure

```
/                    → M1 compliance library (refactored to use <GridEditor>)
/custom              → list of custom tables (localStorage)
/custom/new          → column builder (Nuxt UI table)
/custom/:tableId     → grid editor for a custom table
```

## Runtime Zod Builder

```typescript
// composables/buildRuntimeSchema.ts
function buildRuntimeSchema(columns: ColumnDef[]): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const col of columns) {
    let fieldSchema: z.ZodTypeAny
    if (col.type === 'text') fieldSchema = z.string()
    else if (col.type === 'number') fieldSchema = z.number()
    else if (col.type === 'dropdown') fieldSchema = z.enum(col.choices as [string, ...string[]])
    if (!col.required) fieldSchema = fieldSchema.nullable()
    shape[col.name] = fieldSchema
  }
  shape.id = z.string().uuid()
  shape.createdAt = z.string().datetime()
  shape.updatedAt = z.string().datetime()
  return z.object(shape)
}
```

## Column Definition → Tabulator Columns

```typescript
// composables/definitionToColumns.ts
function definitionToColumns(columns: ColumnDef[]): Record<string, unknown>[] {
  const checkboxCol = { field: '__select', clipboard: false, formatter: 'rowSelection', ... }
  const dataCols = columns.map(col => {
    if (col.type === 'dropdown') return { field: col.name, editor: 'list', editorParams: { values: col.choices }, validator: col.required ? ['required', { type: 'in', parameters: col.choices.join('|') }] : [{ type: 'in', parameters: col.choices.join('|') }], headerFilter: 'list', headerFilterParams: { values: col.choices, clearable: true } }
    if (col.type === 'number') return { field: col.name, editor: 'number', validator: col.required ? 'required' : undefined, headerFilter: 'input' }
    return { field: col.name, editor: 'input', validator: col.required ? 'required' : undefined, headerFilter: 'input' }
  })
  return [checkboxCol, ...dataCols]
}
```
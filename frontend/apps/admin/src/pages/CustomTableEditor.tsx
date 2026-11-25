/**
 * PROTOTYPE — Custom Table Editor (/custom/:tableId)
 *
 * Per architecture.md section 4.4. This page owns the load/render path, the
 * save handler, and the post-creation Add Column flow for a custom table:
 *
 *   1. Look up the definition by id (via `useTableDefinitions`).
 *   2. If absent, render a not-found state with a link back to /custom —
 *      never a white screen, a thrown error, or an empty grid pretending to be
 *      a table.
 *   3. Otherwise derive columns with `definitionToColumns(def.columns)`,
 *      build the runtime schema with `buildRuntimeSchema(def.columns)`,
 *      load rows with `readTableRows(def.id)` (which is corruption-tolerant
 *      by construction — malformed JSON, a non-array, or schema-invalid
 *      entries all yield an empty array rather than throwing), and render
 *      <GridEditor> with `title={def.name}` and `exportFilename` derived
 *      from the table name.
 *   4. The `onSave` handler validates every upsert with the runtime schema
 *      via `safeParse`, converts issues into the engine's error shape
 *      `{ row, rowId, field, message }`, and — only when there are zero
 *      errors — merges upserts, applies deletes, stamps `updatedAt`, and
 *      writes the rows back to localStorage. Because the error shape carries
 *      `rowId`, the shared engine's existing sidebar, cell highlighting and
 *      scroll-to-row all work unchanged.
 *   5. The `toolbarActions` render prop supplies an "Add Column" button that
 *      opens a modal with the same single-row UI as the builder (name, type,
 *      required, choices — choices only for Dropdown). The modal enforces the
 *      same validation rules, including uniqueness against the table's
 *      EXISTING columns (case-insensitive, trimmed) and the reserved-name
 *      list. On confirm the new column is appended as the last column, the
 *      definition's `updatedAt` is stamped (via `updateDefinition`), and
 *      existing rows gain the field with value `null`. Adding a REQUIRED
 *      column to a table that already has rows is explicitly allowed — those
 *      rows then fail validation on the next save with sidebar entries naming
 *      the new column, until the user fills them in. Rename, delete and
 *      type-change of existing columns are NOT offered. Cancelling the modal
 *      changes nothing.
 *
 * The `key` on <GridEditor> combines the table id and the column count so the
 * engine remounts (with fresh `data` and `columns`) both when navigating
 * between two different custom tables AND when a column is added to the
 * current table. The engine treats `data` and `columns` as initial values
 * (see useGridEditor's reactivity semantics in architecture.md section 3.2),
 * so a remount is required for a newly added column to appear in the grid.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UCheckbox from '@nuxt/ui/components/Checkbox.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import USelect from '@nuxt/ui/components/Select.vue';
import GridEditor from 'components/GridEditor';
import { useTableDefinitions } from 'composables/useTableDefinitions';
import { buildRuntimeSchema } from 'utils/buildRuntimeSchema';
import {
  parseChoices,
  isReservedName,
  isDuplicateName,
  hasValidChoices,
} from 'utils/columnValidation';
import { definitionToColumns } from 'utils/definitionToColumns';
import { readTableRows, writeTableRows } from 'utils/tableStorage';
import { computed, defineComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  GridSaveError,
  GridSaveResponse,
} from 'composables/useGridEditor';
import type { ColumnDef, TableRow } from 'src/types/customTable';
import type { VNode } from 'vue';

/**
 * Derive a CSV export filename from a table name. Lowercases, replaces runs
 * of non-alphanumeric characters with a single hyphen, and appends `.csv`.
 * e.g. "Employee Directory" → "employee-directory.csv".
 */
function slugifyFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    // Replace any run of characters that are not a-z, 0-9 with a hyphen.
    .replaceAll(/[^a-z0-9]+/g, '-')
    // Strip leading/trailing hyphens left by the substitution above.
    .replaceAll(/^-+|-+$/g, '');
  // An all-symbol name produces an empty slug; fall back to a generic name
  // so the download always has a sensible filename.
  return `${slug || 'table'}.csv`;
}

const TYPE_ITEMS: Array<{ label: string; value: ColumnDef['type'] }> = [
  { label: 'Text', value: 'text' },
  { label: 'Dropdown', value: 'dropdown' },
  { label: 'Number', value: 'number' },
];

export default defineComponent({
  name: 'CustomTableEditor',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { getDefinition, updateDefinition } = useTableDefinitions();

    // The tableId is a route param. It is reactive in principle, but the
    // <GridEditor :key={gridKey}> below remounts the engine on any id or
    // column-count change, so a plain read of the current value is sufficient
    // here.
    const tableId = computed(() => String(route.params.tableId ?? ''));
    const definition = computed(() => getDefinition(tableId.value));

    // ── Derived grid inputs (computed so they react to the definition) ──
    const columns = computed(() =>
      definition.value ? definitionToColumns(definition.value.columns) : [],
    );
    const rows = computed<Array<Record<string, unknown>>>(() =>
      definition.value ? readTableRows(definition.value.id) : [],
    );
    const exportFilename = computed(() =>
      definition.value ? slugifyFilename(definition.value.name) : 'table.csv',
    );

    // The grid key combines the table id and the column count. The engine
    // treats `data` and `columns` as initial values (it does not watch them
    // for changes — see architecture.md section 3.2), so a remount is
    // required when a column is added. Including the column count in the key
    // means the grid remounts with fresh columns and row data the moment a
    // column is appended, while still remounting on a table-id change.
    const gridKey = computed(() =>
      definition.value
        ? `${definition.value.id}:${definition.value.columns.length}`
        : '',
    );

    // Build the runtime schema once per definition. It is used by the save
    // handler to validate upserts. The schema is built from the definition's
    // columns, so it captures the table's current column set.
    //
    // The validation schema omits the row metadata fields (id, createdAt,
    // updatedAt) because new rows added via "Add Row" or paste arrive with
    // only an id and user-entered column values — the save handler stamps
    // createdAt/updatedAt itself. Validating against the metadata fields
    // would surface meaningless errors ("createdAt is required") instead of
    // the real user-data errors. The compliance path uses the same pattern
    // (ComplianceLibrarySchema.omit({ createdAt, updatedAt })).
    const validationSchema = computed(() =>
      definition.value
        ? buildRuntimeSchema(definition.value.columns).omit({
            id: true,
            createdAt: true,
            updatedAt: true,
          })
        : null,
    );

    // ── Save handler ──
    // Validates every upsert with the runtime schema via safeParse, converts
    // issues into the engine's error shape, and — only when there are zero
    // errors — merges upserts, applies deletes, stamps updatedAt, and writes
    // the rows back to localStorage. All-or-nothing semantics: when any row
    // fails, nothing at all is persisted. The engine's error sidebar, cell
    // highlighting and scroll-to-row all work unchanged because the error
    // objects carry `rowId`.
    async function onSave(payload: {
      upserts: Array<Record<string, unknown>>;
      deletes: Array<string>;
    }): Promise<GridSaveResponse> {
      const def = definition.value;
      const currentSchema = validationSchema.value;
      if (!def || !currentSchema) {
        return { errors: [], saved: 0 };
      }

      // Validate every upsert with the runtime schema via safeParse. Each
      // issue becomes a GridSaveError with `field` from the issue path and
      // `rowId` from the row.
      //
      // The validation schema omits id/createdAt/updatedAt (see above), so
      // safeParse validates only user-entered column values. Crucially,
      // z.coerce.number() in the schema coerces numeric strings to numbers
      // during parsing — we keep the parsed data (result.data) so the coerced
      // values are what gets persisted, not the raw string input.
      const errors: Array<GridSaveError> = [];
      const validatedRows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < payload.upserts.length; i++) {
        const row = payload.upserts[i];
        const result = currentSchema.safeParse(row);
        if (!result.success) {
          for (const issue of result.error.issues) {
            errors.push({
              row: i,
              rowId: (row.id as string) ?? '',
              field: issue.path[0]?.toString() ?? '?',
              message: issue.message,
            });
          }
        } else {
          // Carry the id through (it's not in the validation schema) and
          // merge the coerced/validated column values from result.data.
          validatedRows.push({ ...row, ...result.data });
        }
      }

      // All-or-nothing: only persist when there are zero errors.
      if (errors.length > 0) {
        return { errors, saved: 0 };
      }

      // Merge upserts and apply deletes against the stored rows.
      const existing = readTableRows(def.id);
      const deleteSet = new Set(payload.deletes);
      const now = new Date().toISOString();
      const surviving = existing.filter((r) => !deleteSet.has(r.id));

      for (const upsert of validatedRows) {
        const idx = surviving.findIndex((r) => r.id === upsert.id);
        if (idx >= 0) {
          // Preserve the original createdAt; stamp a fresh updatedAt.
          surviving[idx] = {
            ...upsert,
            id: upsert.id as string,
            createdAt: surviving[idx].createdAt,
            updatedAt: now,
          };
        } else {
          // A new row — stamp both timestamps.
          surviving.push({
            ...upsert,
            id: upsert.id as string,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      writeTableRows(def.id, surviving);

      return {
        errors: [],
        saved: payload.upserts.length + payload.deletes.length,
      };
    }

    // ── Not-found back-link ──
    function goToList(): void {
      void router.push('/custom');
    }

    // ── Add Column modal state ──
    // The modal reuses the builder's single-row UI (name / type / required /
    // choices) with the same validation rules, including uniqueness against
    // the table's EXISTING columns. `choicesText` holds the raw
    // comma-separated string; it is parsed into `choices` only at confirm
    // time, so the value survives a type round-trip without being lost.
    const showAddColumnModal = ref(false);
    const newColumnName = ref('');
    const newColumnType = ref<ColumnDef['type']>('text');
    const newColumnRequired = ref(false);
    const newColumnChoicesText = ref('');
    const addColumnErrors = ref<Array<string>>([]);

    function openAddColumnModal(): void {
      // Reset to blank defaults each time the modal opens.
      newColumnName.value = '';
      newColumnType.value = 'text';
      newColumnRequired.value = false;
      newColumnChoicesText.value = '';
      addColumnErrors.value = [];
      showAddColumnModal.value = true;
    }

    function closeAddColumnModal(): void {
      showAddColumnModal.value = false;
      addColumnErrors.value = [];
    }

    function updateNewColumnName(value: string): void {
      newColumnName.value = value;
      addColumnErrors.value = [];
    }

    function updateNewColumnType(value: ColumnDef['type']): void {
      newColumnType.value = value;
      addColumnErrors.value = [];
    }

    function updateNewColumnRequired(value: boolean): void {
      newColumnRequired.value = value;
      addColumnErrors.value = [];
    }

    function updateNewColumnChoices(value: string): void {
      newColumnChoicesText.value = value;
      addColumnErrors.value = [];
    }

    /**
     * Validate the new column against the same rules as the builder, plus
     * uniqueness against the table's EXISTING columns (case-insensitive,
     * trimmed). Returns an array of error messages; empty means valid.
     */
    function validateNewColumn(): Array<string> {
      const errors: Array<string> = [];
      const def = definition.value;
      if (!def) {
        return errors;
      }

      const trimmedName = newColumnName.value.trim();

      if (!trimmedName) {
        errors.push('Column name is required.');
        return errors;
      }

      if (isReservedName(trimmedName)) {
        errors.push(`"${trimmedName}" is a reserved name.`);
      }

      const existingNames = def.columns.map((c) => c.name);
      if (isDuplicateName(trimmedName, existingNames)) {
        errors.push(
          `Duplicate column name "${trimmedName}". Names must be unique.`,
        );
      }

      if (
        newColumnType.value === 'dropdown' &&
        !hasValidChoices(newColumnChoicesText.value)
      ) {
        errors.push('Dropdown column needs at least one choice.');
      }

      return errors;
    }

    /**
     * Confirm the Add Column modal. Validates, and on success appends the
     * new column to the definition (via `updateDefinition`, which stamps
     * `updatedAt`), adds the new field with value `null` to every existing
     * row in storage, and closes the modal. The grid remounts via the
     * `gridKey` change (column count incremented) so the new column appears
     * immediately.
     */
    function confirmAddColumn(): void {
      const def = definition.value;
      if (!def) {
        return;
      }

      const errors = validateNewColumn();
      if (errors.length > 0) {
        addColumnErrors.value = errors;
        return;
      }

      const newColumn: ColumnDef = {
        id: crypto.randomUUID(),
        name: newColumnName.value.trim(),
        type: newColumnType.value,
        required: newColumnRequired.value,
        choices:
          newColumnType.value === 'dropdown'
            ? parseChoices(newColumnChoicesText.value)
            : [],
      };

      // Append the new column to the definition. updateDefinition stamps
      // updatedAt on the definition.
      updateDefinition(def.id, {
        columns: [...def.columns, newColumn],
      });

      // Add the new field with value null to every existing row. Existing
      // row data must not be lost — only the new field is added.
      const existingRows = readTableRows(def.id);
      const updatedRows: Array<TableRow> = existingRows.map(
        (row): TableRow => ({
          ...row,
          [newColumn.name]: null,
        }),
      );
      writeTableRows(def.id, updatedRows);

      // Close the modal. The grid remounts via the gridKey change (column
      // count incremented) so the new column appears immediately.
      showAddColumnModal.value = false;
      addColumnErrors.value = [];
    }

    // ── toolbarActions render prop ──
    // Supplies the Add Column button in the shared toolbar. TSX cannot use
    // SFC named slots, so the extension point is a render prop (see
    // architecture.md section 3.1).
    function renderToolbarActions(): VNode {
      return (
        <UButton
          label="Add Column"
          color="neutral"
          variant="outline"
          size="xs"
          onClick={openAddColumnModal}
        />
      );
    }

    return (): VNode => {
      const def = definition.value;

      // ── Not-found state ──
      // Rendered when the tableId does not match any definition. Never a
      // white screen, never a thrown error, never a rendered grid. The nav
      // header (from Application.tsx) still wraps the outlet, so the shell
      // is intact.
      if (!def) {
        return (
          <div class="flex h-full flex-col items-center justify-center gap-4 bg-muted p-8 text-center">
            <div class="text-4xl text-muted">🗂️</div>
            <h1 class="text-lg font-semibold text-highlighted">
              Table not found
            </h1>
            <p class="max-w-md text-sm text-muted">
              The table you are looking for does not exist or has been deleted.
            </p>
            <UButton
              label="Back to Custom Tables"
              color="primary"
              variant="outline"
              onClick={goToList}
            />
          </div>
        );
      }

      // ── Editor ──
      // The `key` combines the table id and the column count so the engine
      // remounts (with fresh initial data and columns) both when navigating
      // between two different custom tables AND when a column is added.
      return (
        <div class="flex h-full flex-col overflow-hidden">
          <GridEditor
            key={gridKey.value}
            columns={columns.value}
            data={rows.value}
            onSave={onSave}
            title={def.name}
            exportFilename={exportFilename.value}
            toolbarActions={renderToolbarActions}
          />

          {/* ── Add Column modal ── */}
          {/* Reuses the builder's single-row UI with the same validation rules.
              The Nuxt UI Modal uses named slots: `body` for the form content and
              `footer` for the action buttons. TSX passes named slots as an object
              child with the slot name as the key. */}
          <UModal
            open={showAddColumnModal.value}
            title="Add Column"
            description="The new column will be appended as the last column. Existing rows will have an empty value for it."
            onUpdate:open={(v: boolean) => {
              if (!v) {
                closeAddColumnModal();
              }
            }}
          >
            {{
              body: (): VNode => (
                <div class="space-y-4">
                  {/* Name */}
                  <div class="flex flex-col gap-1">
                    <label
                      class="text-sm font-medium text-default"
                      for="new-col-name"
                    >
                      Column name
                    </label>
                    <UInput
                      id="new-col-name"
                      modelValue={newColumnName.value}
                      placeholder="Column name"
                      onUpdate:modelValue={(v: string) =>
                        updateNewColumnName(v)
                      }
                    />
                  </div>

                  {/* Type */}
                  <div class="flex flex-col gap-1">
                    <label
                      class="text-sm font-medium text-default"
                      for="new-col-type"
                    >
                      Type
                    </label>
                    <USelect
                      id="new-col-type"
                      modelValue={newColumnType.value}
                      items={TYPE_ITEMS}
                      onUpdate:modelValue={(v) => updateNewColumnType(v)}
                    />
                  </div>

                  {/* Required */}
                  <div class="flex items-center gap-2">
                    <UCheckbox
                      id="new-col-required"
                      modelValue={newColumnRequired.value}
                      onUpdate:modelValue={(v) =>
                        updateNewColumnRequired(v === true)
                      }
                    />
                    <label class="text-sm text-default" for="new-col-required">
                      Required
                    </label>
                  </div>

                  {/* Choices — only visible for Dropdown */}
                  {newColumnType.value === 'dropdown' ? (
                    <div class="flex flex-col gap-1">
                      <label
                        class="text-sm font-medium text-default"
                        for="new-col-choices"
                      >
                        Choices
                      </label>
                      <UInput
                        id="new-col-choices"
                        modelValue={newColumnChoicesText.value}
                        placeholder="Comma-separated, e.g. Low, Medium, High"
                        onUpdate:modelValue={(v: string) =>
                          updateNewColumnChoices(v)
                        }
                      />
                    </div>
                  ) : null}

                  {/* ── Validation errors ── */}
                  {addColumnErrors.value.length > 0 ? (
                    <div
                      data-testid="add-column-errors"
                      class="rounded-lg border border-error bg-error/10 p-4"
                      role="alert"
                    >
                      <ul class="list-disc space-y-1 pl-5 text-sm text-error">
                        {addColumnErrors.value.map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ),
              footer: (): VNode => (
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    onClick={closeAddColumnModal}
                  />
                  <UButton
                    label="Add Column"
                    color="primary"
                    onClick={confirmAddColumn}
                  />
                </div>
              ),
            }}
          </UModal>
        </div>
      );
    };
  },
});

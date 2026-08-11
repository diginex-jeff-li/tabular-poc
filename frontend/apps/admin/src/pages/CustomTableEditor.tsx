/**
 * PROTOTYPE — Custom Table Editor (/custom/:tableId)
 *
 * Per architecture.md section 4.4. This page owns the load/render path and
 * the save handler for a custom table:
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
 *
 * The `key` on <GridEditor> is the table id so navigating between two
 * different custom tables remounts the engine with fresh `data` (the
 * engine treats `data` as initial data — see useGridEditor's reactivity
 * semantics in architecture.md section 3.2).
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import { computed, defineComponent, type VNode } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GridEditor from 'components/GridEditor';
import { useTableDefinitions } from 'composables/useTableDefinitions';
import { definitionToColumns } from 'utils/definitionToColumns';
import { buildRuntimeSchema } from 'utils/buildRuntimeSchema';
import { readTableRows, writeTableRows } from 'utils/tableStorage';
import type { GridSaveError, GridSaveResponse } from 'composables/useGridEditor';
import type { TableRow } from 'src/types/customTable';

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
    .replace(/[^a-z0-9]+/g, '-')
    // Strip leading/trailing hyphens left by the substitution above.
    .replace(/^-+|-+$/g, '');
  // An all-symbol name produces an empty slug; fall back to a generic name
  // so the download always has a sensible filename.
  return `${slug || 'table'}.csv`;
}

export default defineComponent({
  name: 'CustomTableEditor',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { getDefinition } = useTableDefinitions();

    // The tableId is a route param. It is reactive in principle, but the
    // <GridEditor :key={tableId}> below remounts the engine on any id change,
    // so a plain read of the current value is sufficient here.
    const tableId = computed(() => String(route.params.tableId ?? ''));
    const definition = computed(() => getDefinition(tableId.value));

    // ── Derived grid inputs (computed so they react to the definition) ──
    const columns = computed(() =>
      definition.value ? definitionToColumns(definition.value.columns) : [],
    );
    const rows = computed<Record<string, unknown>[]>(() =>
      definition.value ? readTableRows(definition.value.id) : [],
    );
    const exportFilename = computed(() =>
      definition.value ? slugifyFilename(definition.value.name) : 'table.csv',
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
      upserts: Record<string, unknown>[];
      deletes: string[];
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
      const errors: GridSaveError[] = [];
      const validatedRows: Record<string, unknown>[] = [];
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
            createdAt: (surviving[idx] as TableRow).createdAt,
            updatedAt: now,
          } as TableRow;
        } else {
          // A new row — stamp both timestamps.
          surviving.push({
            ...upsert,
            id: upsert.id as string,
            createdAt: now,
            updatedAt: now,
          } as TableRow);
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
      router.push('/custom');
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
              The table you are looking for does not exist or has been
              deleted.
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
      // The `key` is the table id so the engine remounts (with fresh initial
      // data) when navigating between two different custom tables.
      return (
        <GridEditor
          key={def.id}
          columns={columns.value}
          data={rows.value}
          onSave={onSave}
          title={def.name}
          exportFilename={exportFilename.value}
        />
      );
    };
  },
});

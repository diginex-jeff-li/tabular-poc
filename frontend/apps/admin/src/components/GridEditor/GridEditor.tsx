// Loaded with the Tabulator engine only, so DataGrid pages never fetch it.
import 'tabulator-tables/dist/css/tabulator_modern.min.css';
import UBadge from '@nuxt/ui/components/Badge.vue';
/**
 * GridEditor — the shared grid engine's presentation.
 *
 * Owns the DOM only; all grid behaviour lives in `useGridEditor`. This
 * component knows nothing about the compliance domain — it receives
 * Tabulator column definitions, initial rows, a save callback, a toolbar
 * title, a CSV export filename, and an optional `toolbarActions` render
 * prop for extra toolbar buttons.
 *
 * Layout contract (mandatory): the root is `flex flex-col h-full`; the grid
 * host is `flex-1 min-h-0`; Tabulator is configured `height: '100%'` with a
 * CSS rule pinning `.tabulator` to 100%. No `100vh` arithmetic anywhere —
 * this is what lets the editor sit under a nav header (added in feature a5)
 * without silently breaking. The component fills whatever vertical space
 * its parent gives it.
 *
 * TSX cannot use SFC named slots — `toolbarActions` is a render prop returning
 * VNode | VNode[], invoked as `props.toolbarActions?.()`.
 *
 * PROTOTYPE — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import ColumnVisibilityMenu from 'components/ColumnVisibilityMenu';
import { gridEngineProps } from 'components/gridEngineProps';
import { useGridEditor } from 'composables/useGridEditor';
import { rowLabel } from 'utils/gridApi';
import { computed, defineComponent, ref } from 'vue';
import type { PropType, VNode } from 'vue';

// ── Licensing comparison data (generic marketing content, stays in the engine) ──

const LICENSE_COMPARISON = [
  {
    feature: 'Clipboard paste from Excel',
    tabulator: '✅ Free',
    agGrid: '❌ Enterprise ($/dev/yr)',
    revoGrid: '✅ Free',
  },
  {
    feature: 'Cell validation framework',
    tabulator: '✅ Free',
    agGrid: '✅ Free (basic)',
    revoGrid: '❌ Pro ($149+/dev/yr)',
  },
  {
    feature: 'Range selection',
    tabulator: '✅ Free',
    agGrid: '❌ Enterprise ($/dev/yr)',
    revoGrid: '✅ Free',
  },
  {
    feature: 'Column filtering',
    tabulator: '✅ Free',
    agGrid: '✅ Free (basic)',
    revoGrid: '❌ Pro ($149+/dev/yr)',
  },
  {
    feature: 'Multi-column sorting',
    tabulator: '✅ Free',
    agGrid: '✅ Free',
    revoGrid: '❌ Pro ($149+/dev/yr)',
  },
  {
    feature: 'CSV / Excel export',
    tabulator: '✅ Free',
    agGrid: '❌ Enterprise ($/dev/yr)',
    revoGrid: '❌ Pro ($149+/dev/yr)',
  },
  {
    feature: 'Checkbox row selection',
    tabulator: '✅ Free',
    agGrid: '✅ Free',
    revoGrid: '✅ Free',
  },
  {
    feature: 'License',
    tabulator: 'MIT (no paid tier)',
    agGrid: 'EULA (per-dev, per-deploy)',
    revoGrid: 'MIT core + Pro $149-499/dev/yr',
  },
];

export default defineComponent({
  name: 'GridEditor',
  props: {
    columns: {
      type: Array as PropType<Array<Record<string, unknown>>>,
      required: true,
    },
    ...gridEngineProps,
  },
  setup(props) {
    const tableEl = ref<HTMLDivElement | null>(null);
    const showLicensePanel = ref(false);
    const showClearConfirm = ref(false);

    const grid = useGridEditor({
      tableEl,
      columns: ref(props.columns),
      data: ref(props.data),
      onSave: props.onSave,
      exportFilename: props.exportFilename,
      normalizeRow: props.normalizeRow,
      onUserEdit: props.onUserEdit,
      pasteParser: props.pasteParser,
    });
    const {
      rowCount,
      columnItems,
      setColumnVisible,
      dirtyCount,
      isSaving,
      errorList,
      saveResult,
      handleAddRow,
      handleSave,
      handleDeleteSelected,
      handleExportCSV,
      clearGrid,
      scrollToError,
      rowNumber,
    } = grid;
    props.onReady?.({
      getRows: grid.getRows,
      addRows: grid.addRows,
      updateRows: grid.updateRows,
      deleteRows: grid.deleteRows,
      showErrors: grid.showErrors,
    });

    const errorCount = computed(() => errorList.value.length);
    const hasUnsavedChanges = computed(() => dirtyCount.value > 0);

    return (): VNode => (
      <div class="flex h-full flex-col overflow-hidden">
        {/* ── Toolbar ── */}
        <div class="flex h-12 items-center gap-2 border-b border-default bg-muted px-4">
          <h1 class="mr-4 text-sm font-semibold text-highlighted">
            {props.title}
          </h1>
          <UButton
            label="Add Row"
            color="primary"
            variant="outline"
            size="xs"
            onClick={handleAddRow}
          />
          <UButton
            label={props.saveLabel}
            color="primary"
            size="xs"
            loading={isSaving.value}
            disabled={!hasUnsavedChanges.value}
            onClick={handleSave}
          />
          <UButton
            label="Delete"
            color="error"
            variant="ghost"
            size="xs"
            onClick={handleDeleteSelected}
          />
          <div class="mx-1 h-5 w-px bg-default" />
          <ColumnVisibilityMenu
            columns={columnItems.value}
            onToggle={setColumnVisible}
          />
          <UButton
            label="Export"
            color="neutral"
            variant="outline"
            size="xs"
            onClick={handleExportCSV}
          />
          <UButton
            label="Clear"
            color="neutral"
            variant="ghost"
            size="xs"
            onClick={() => {
              showClearConfirm.value = true;
            }}
          />
          {/* ── Extension point: extra toolbar buttons via render prop ── */}
          {props.toolbarActions?.()}
          <UButton
            label="Why Tabulator?"
            color="info"
            variant="ghost"
            size="xs"
            onClick={() => {
              showLicensePanel.value = !showLicensePanel.value;
            }}
          />

          {/* ── Status chips (role="status" aria-live="polite") ── */}
          <div
            class="ml-auto flex items-center gap-3 text-xs"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- toolbar status chips, not a calculation result (<output>)
            role="status"
            aria-live="polite"
          >
            <span class="text-muted">
              <strong class="text-default font-semibold">
                {rowCount.value}
              </strong>{' '}
              rows
            </span>
            {hasUnsavedChanges.value && (
              <span class="text-warning">
                <strong class="font-semibold">{dirtyCount.value}</strong>{' '}
                {dirtyCount.value === 1 ? 'change' : 'changes'}
              </span>
            )}
            {errorCount.value > 0 && (
              <span class="text-error">
                <strong class="font-semibold">{errorCount.value}</strong> errors
              </span>
            )}
            {saveResult.value && saveResult.value.saved > 0 && (
              <UBadge
                color="success"
                label={props.savedLabel(saveResult.value.saved)}
                variant="soft"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* ── Grid host (flex-1 min-h-0 — fills remaining space below the toolbar) ── */}
        <div class="relative min-h-0 flex-1 overflow-hidden">
          {/* tabindex -1: Tabulator listens for `paste` on this element, so
              it must be able to take focus when the grid has no cells. */}
          <div ref={tableEl} tabindex={-1} class="h-full w-full" />

          {/* ── Empty-state paste overlay: a press focuses the grid ── */}
          {rowCount.value === 0 && !isSaving.value && (
            <div
              role="presentation"
              data-testid="grid-empty"
              class="absolute inset-0 flex cursor-text flex-col items-center justify-center gap-3 bg-muted/80 backdrop-blur-sm"
              onClick={() => tableEl.value?.focus()}
            >
              <div class="text-4xl text-muted">📋</div>
              <p class="text-lg font-medium text-default">
                Paste your Excel data here
              </p>
              <p class="text-sm text-muted">
                Click here, then press{' '}
                <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-xs font-mono">
                  Ctrl+V
                </kbd>{' '}
                (
                <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-xs font-mono">
                  ⌘V
                </kbd>{' '}
                on a Mac)
              </p>
              <p class="text-xs text-muted">
                or click “Add Row” to create manually
              </p>
            </div>
          )}

          {/* ── Error sidebar (absolutely positioned right, w-80) ── */}
          {errorList.value.length > 0 && (
            <div class="absolute right-0 top-0 z-10 w-80 max-h-full overflow-auto border-l border-default bg-default shadow-lg">
              <div class="sticky top-0 bg-error/10 px-3 py-2 border-b border-default">
                <h2 class="text-sm font-semibold text-error">
                  Validation Errors ({errorList.value.length})
                </h2>
              </div>
              <div class="space-y-2 p-3">
                {errorList.value.map((err, i) => (
                  <button
                    key={i}
                    type="button"
                    class="block w-full cursor-pointer rounded border border-default bg-muted p-3 text-left text-xs hover:bg-default focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => scrollToError(err)}
                  >
                    <div class="font-semibold text-error">
                      {rowLabel(rowNumber(err.rowId))}: {err.field}
                    </div>
                    <div class="mt-1 text-muted">{err.message}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Licensing slide-over (from bottom) ── */}
        {showLicensePanel.value && (
          // Backdrop click closes the panel; the ✕ button is the keyboard path.
          <div
            role="presentation"
            class="absolute inset-0 z-20 flex items-end"
            onClick={() => {
              showLicensePanel.value = false;
            }}
          >
            <div class="absolute inset-0 bg-black/20" />
            <div
              role="presentation"
              class="relative max-h-[60vh] w-full overflow-auto rounded-t-lg border-t border-default bg-default shadow-2xl"
              onClick={(e: Event) => e.stopPropagation()}
            >
              <div class="sticky top-0 flex items-center justify-between border-b border-default bg-muted px-4 py-3">
                <h2 class="text-sm font-semibold text-highlighted">
                  Why Tabulator? — Feature & Licensing Comparison
                </h2>
                <UButton
                  label="✕"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    showLicensePanel.value = false;
                  }}
                />
              </div>
              <div class="p-4">
                <p class="mb-3 text-xs text-muted">
                  All features below are free in Tabulator (MIT). AG Grid and
                  RevoGrid gate key features behind paid tiers. Source:
                  ag-grid.com, rv-grid.com (verified Aug 2026).
                </p>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default">
                      <th
                        scope="col"
                        class="px-3 py-2 text-left font-medium text-muted"
                      >
                        Feature
                      </th>
                      <th
                        scope="col"
                        class="px-3 py-2 text-left font-medium text-success"
                      >
                        Tabulator
                      </th>
                      <th
                        scope="col"
                        class="px-3 py-2 text-left font-medium text-error"
                      >
                        AG Grid
                      </th>
                      <th
                        scope="col"
                        class="px-3 py-2 text-left font-medium text-error"
                      >
                        RevoGrid
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {LICENSE_COMPARISON.map((row, i) => (
                      <tr key={i} class="border-b border-default">
                        <td class="px-3 py-2 text-default font-medium">
                          {row.feature}
                        </td>
                        <td class="px-3 py-2 text-success">{row.tabulator}</td>
                        <td class="px-3 py-2 text-error">{row.agGrid}</td>
                        <td class="px-3 py-2 text-error">{row.revoGrid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Clear confirmation modal ── */}
        {showClearConfirm.value && (
          <UModal
            open={showClearConfirm.value}
            onUpdate:open={(v: boolean) => {
              showClearConfirm.value = v;
            }}
          >
            {{
              // The default slot is UModal's trigger; the dialog body is `content`.
              content: (): VNode => (
                <div class="p-6">
                  <h3 class="text-lg font-semibold text-highlighted">
                    Clear all rows?
                  </h3>
                  <p class="mt-2 text-sm text-muted">
                    This will remove all {rowCount.value} rows from the grid.
                    Unsaved changes will be lost. Saved rows will remain in the
                    backend store.
                  </p>
                  <div class="mt-4 flex justify-end gap-2">
                    <UButton
                      label="Cancel"
                      color="neutral"
                      variant="ghost"
                      onClick={() => {
                        showClearConfirm.value = false;
                      }}
                    />
                    <UButton
                      label="Clear All"
                      color="error"
                      onClick={() => {
                        clearGrid();
                        showClearConfirm.value = false;
                      }}
                    />
                  </div>
                </div>
              ),
            }}
          </UModal>
        )}

        <style>{`
          .backend-validation-error {
            background-color: #fee2e2 !important;
            border: 2px solid #ef4444 !important;
          }
          .tabulator-validation-fail {
            border: 2px solid #ef4444 !important;
          }
          .tabulator {
            height: 100% !important;
          }
        `}</style>
      </div>
    );
  },
});

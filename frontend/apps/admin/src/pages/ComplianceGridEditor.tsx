/**
 * PROTOTYPE — Compliance Library Grid Editor
 *
 * Tickets 06, 08, 09, 10, 12, 13, 14: The full admin grid editor.
 * - Paste from Excel, Add Row, checkbox select, Save with Zod validation,
 *   per-cell error highlighting, error sidebar, Delete Selected, Clear.
 * - Column header filters + multi-column sorting (Ticket 12).
 * - CSV export (Ticket 13).
 * - Licensing comparison panel (Ticket 14).
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UBadge from '@nuxt/ui/components/Badge.vue';
import {
  computed,
  defineComponent,
  onMounted,
  ref,
  shallowRef,
  type VNode,
} from 'vue';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { z } from 'zod';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';
import { useDirtyTracking } from 'composables/useDirtyTracking';

// ── Inline Zod schema ──

const CategoryCodeEnum = z.enum([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q',
]);
const ComplianceCategoryEnum = z.enum(['Governance', 'Social', 'Environment']);
const TopicEnum = z.enum([
  'Key Compliance Requirements', 'Zero Tolerance Policy', 'Freedom of Association',
  'Recruitment & Fees', 'Forced & Compulsory Labour', 'Wages & Benefits',
  'Working Hours', 'Occupational Safety & Health', 'Environmental Responsibility',
  'Grievance Mechanisms', 'Discrimination', 'Business Integrity',
  'Compliance Requirements', 'Community & Environment',
]);
const RiskLevelEnum = z.enum(['High', 'Medium', 'Low']);
const ClosureTimingEnum = z.enum(['7', '30', '60', '90', 'Next assessment']);

const ComplianceLibrarySchema = z.object({
  id: z.string().uuid(),
  categoryCode: CategoryCodeEnum,
  complianceCategory: ComplianceCategoryEnum,
  topic: TopicEnum,
  riskLevel: RiskLevelEnum,
  issue: z.string(),
  closureTiming: ClosureTimingEnum,
  evidenceExpectation: z.string().nullable(),
  bestPractice: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const UpsertSchema = ComplianceLibrarySchema.omit({ createdAt: true, updatedAt: true });

type BackendError = { row: number; field: string; message: string };
type SaveResponse = { errors: BackendError[]; saved: number };

// ── Mock backend with in-memory persistence ──

const SEED_ROWS: Record<string, unknown>[] = [
  { id: crypto.randomUUID(), categoryCode: 'A', complianceCategory: 'Governance', topic: 'Key Compliance Requirements', riskLevel: 'High', issue: 'Facility operating without valid business license', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'A', complianceCategory: 'Governance', topic: 'Key Compliance Requirements', riskLevel: 'Medium', issue: 'Legally required labor contracts missing for >10% of sampled workers', closureTiming: '60', evidenceExpectation: 'Evidence within 60 days', bestPractice: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'B', complianceCategory: 'Social', topic: 'Zero Tolerance Policy', riskLevel: 'High', issue: 'Child labor observed on premises', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: 'Verify age documentation for all workers', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'C', complianceCategory: 'Social', topic: 'Freedom of Association', riskLevel: 'High', issue: 'Evidence of prison labor', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'F', complianceCategory: 'Social', topic: 'Wages & Benefits', riskLevel: 'High', issue: 'Non-payment of wages exceeding 1 month', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: 'Maintain proper records; provide clear pay slips', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'H', complianceCategory: 'Social', topic: 'Occupational Safety & Health', riskLevel: 'High', issue: 'Conditions presenting imminent threat of injury (locked exits/no fire equipment)', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'I', complianceCategory: 'Environment', topic: 'Environmental Responsibility', riskLevel: 'High', issue: 'Illegal wastewater discharge', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'M', complianceCategory: 'Governance', topic: 'Compliance Requirements', riskLevel: 'High', issue: 'Full denial of audit access', closureTiming: '7', evidenceExpectation: 'Immediate notification required', bestPractice: 'Never deny access to facility/documents/workers', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'P', complianceCategory: 'Social', topic: 'Recruitment & Fees', riskLevel: 'High', issue: 'Workers charged recruitment fees by employer or agents', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: 'No worker should pay for a job; all fees borne by employer', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: crypto.randomUUID(), categoryCode: 'Q', complianceCategory: 'Social', topic: 'Forced & Compulsory Labour', riskLevel: 'High', issue: 'Physical or sexual violence against workers', closureTiming: '30', evidenceExpectation: 'Evidence within 30 days', bestPractice: 'ILO indicators: abuse of vulnerability; deception; restriction of movement', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

let store: Record<string, unknown>[] = [...SEED_ROWS];

function mockList(): Record<string, unknown>[] {
  return [...store];
}

async function mockBulkSave(payload: {
  upserts: Record<string, unknown>[];
  deletes: string[];
}): Promise<SaveResponse> {
  await new Promise((r) => setTimeout(r, 300));
  const errors: BackendError[] = [];

  for (let i = 0; i < payload.upserts.length; i++) {
    const row = payload.upserts[i];
    const result = UpsertSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: i,
          field: issue.path[0]?.toString() ?? '?',
          message: issue.message,
        });
      }
    }
  }

  if (errors.length > 0) return { errors, saved: 0 };

  const deleteSet = new Set(payload.deletes);
  store = store.filter((r) => !deleteSet.has(r.id as string));

  for (const upsert of payload.upserts) {
    const idx = store.findIndex((r) => r.id === upsert.id);
    const now = new Date().toISOString();
    if (idx >= 0) {
      store[idx] = { ...upsert, createdAt: store[idx].createdAt, updatedAt: now };
    } else {
      store.push({ ...upsert, createdAt: now, updatedAt: now });
    }
  }

  return { errors: [], saved: payload.upserts.length + payload.deletes.length };
}

// ── Licensing comparison data (Ticket 14) ──

const LICENSE_COMPARISON = [
  { feature: 'Clipboard paste from Excel', tabulator: '✅ Free', agGrid: '❌ Enterprise ($/dev/yr)', revoGrid: '✅ Free' },
  { feature: 'Cell validation framework', tabulator: '✅ Free', agGrid: '✅ Free (basic)', revoGrid: '❌ Pro ($149+/dev/yr)' },
  { feature: 'Range selection', tabulator: '✅ Free', agGrid: '❌ Enterprise ($/dev/yr)', revoGrid: '✅ Free' },
  { feature: 'Column filtering', tabulator: '✅ Free', agGrid: '✅ Free (basic)', revoGrid: '❌ Pro ($149+/dev/yr)' },
  { feature: 'Multi-column sorting', tabulator: '✅ Free', agGrid: '✅ Free', revoGrid: '❌ Pro ($149+/dev/yr)' },
  { feature: 'CSV / Excel export', tabulator: '✅ Free', agGrid: '❌ Enterprise ($/dev/yr)', revoGrid: '❌ Pro ($149+/dev/yr)' },
  { feature: 'Checkbox row selection', tabulator: '✅ Free', agGrid: '✅ Free', revoGrid: '✅ Free' },
  { feature: 'License', tabulator: 'MIT (no paid tier)', agGrid: 'EULA (per-dev, per-deploy)', revoGrid: 'MIT core + Pro $149-499/dev/yr' },
];

export default defineComponent({
  name: 'ComplianceGridEditor',
  setup() {
    const tableEl = ref<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabulator = shallowRef<any>(null);
    const isSaving = ref(false);
    const saveResult = ref<SaveResponse | null>(null);
    const errorList = ref<BackendError[]>([]);
    const showLicensePanel = ref(false);

    // Derive columns from Zod schema (id/createdAt/updatedAt are hidden)
    const dataColumns = zodToTabulatorColumns(ComplianceLibrarySchema);

    // Add header filters to each data column (Ticket 12)
    // For enum columns: list filter (dropdown). For text columns: input filter.
    const enumFields = new Set(['categoryCode', 'complianceCategory', 'topic', 'riskLevel', 'closureTiming']);
    for (const col of dataColumns) {
      const colDef = col as unknown as Record<string, unknown>;
      const field = colDef.field as string;
      if (enumFields.has(field)) {
        const enumValues = (colDef.editorParams as { values: string[] }).values;
        colDef.headerFilter = 'list';
        colDef.headerFilterParams = { values: enumValues, clearable: true };
      } else {
        colDef.headerFilter = 'input';
        colDef.headerFilterPlaceholder = 'Filter...';
      }
    }

    // Checkbox column for row selection (Ticket 09)
    const checkboxColumn = {
      title: '',
      field: '__select',
      width: 45,
      hozAlign: 'center',
      headerSort: false,
      headerFilter: false,
      formatter: 'rowSelection',
      titleFormatter: 'rowSelection',
      cellClick: (e: Event, cell: { getRow: () => { toggleSelect: () => void } }) => {
        cell.getRow().toggleSelect();
      },
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const columns = [checkboxColumn, ...dataColumns];

    // Dirty tracking
    const { dirtyCount, markDirty, buildSavePayload, clearDirty, markDeleted } =
      useDirtyTracking(tabulator);

    const errorCount = computed(() => errorList.value.length);

    onMounted(() => {
      if (!tableEl.value) return;

      const opts = {
        data: mockList(),
        reactiveData: true,
        columns,
        clipboard: true,
        clipboardPasteParser: 'table',
        clipboardPasteAction: 'insert',
        clipboardCopyConfig: { columnHeaders: false },
        validationMode: 'highlight',
        height: '500px',
        layout: 'fitDataFill',
        movableColumns: false,
        autoColumns: false,
        selectable: true,
        headerSortClickElement: 'icon',
        // Multi-column sort: shift+click adds secondary sort
        // (enabled by default — Tabulator supports it natively)
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      tabulator.value = new Tabulator(tableEl.value, opts);

      // After paste, add UUIDs and mark dirty
      tabulator.value.on('clipboardPasted', () => {
        const data = tabulator.value.getData();
        let needsUpdate = false;
        const updated = data.map((row: Record<string, unknown>) => {
          if (!row.id) {
            needsUpdate = true;
            return { ...row, id: crypto.randomUUID() };
          }
          return row;
        });
        if (needsUpdate) {
          tabulator.value.replaceData(updated);
        }
        for (const row of updated) {
          if (row.id) {
            markDirty(row.id as string, 'added');
          }
        }
      });
    });

    // ── Add Row (Ticket 08) ──
    const handleAddRow = () => {
      if (!tabulator.value) return;
      const newRow = { id: crypto.randomUUID() };
      tabulator.value.addRow(newRow, true);
      markDirty(newRow.id, 'added');
    };

    // ── Export CSV (Ticket 13) ──
    const handleExportCSV = () => {
      if (!tabulator.value) return;
      tabulator.value.download('csv', 'compliance-library.csv', {
        delimiter: ',',
      });
    };

    // ── Save loop (Ticket 06) ──
    const handleSave = async () => {
      if (!tabulator.value || isSaving.value) return;
      isSaving.value = true;
      errorList.value = [];
      saveResult.value = null;

      const payload = buildSavePayload();

      if (payload.upserts.length === 0 && payload.deletes.length === 0) {
        isSaving.value = false;
        saveResult.value = { errors: [], saved: 0 };
        return;
      }

      try {
        const result = await mockBulkSave(payload);
        saveResult.value = result;

        if (result.errors.length > 0) {
          errorList.value = result.errors;
          applyErrorHighlights(result.errors);
        } else {
          clearDirty();
          clearErrorHighlights();
        }
      } catch {
        saveResult.value = { errors: [{ row: 0, field: 'network', message: 'Save failed' }], saved: 0 };
      } finally {
        isSaving.value = false;
      }
    };

    function applyErrorHighlights(errors: BackendError[]) {
      if (!tabulator.value) return;
      clearErrorHighlights();
      const rows = tabulator.value.getRows();
      for (const err of errors) {
        const row = rows[err.row];
        if (!row) continue;
        const cell = row.getCell(err.field);
        if (!cell) continue;
        const el = cell.getElement() as HTMLElement;
        el.classList.add('backend-validation-error');
      }
    }

    function clearErrorHighlights() {
      if (!tabulator.value) return;
      const cells = tabulator.value.element?.querySelectorAll('.backend-validation-error');
      if (cells) {
        cells.forEach((c: Element) => c.classList.remove('backend-validation-error'));
      }
    }

    const scrollToError = (err: BackendError) => {
      if (!tabulator.value) return;
      const rows = tabulator.value.getRows();
      const row = rows[err.row];
      if (row) {
        row.scrollTo();
        const cell = row.getCell(err.field);
        if (cell) {
          const el = cell.getElement() as HTMLElement;
          el.style.outline = '3px solid #ef4444';
          setTimeout(() => { el.style.outline = ''; }, 2000);
        }
      }
    };

    const clearGrid = () => {
      tabulator.value?.clearData();
      clearDirty();
      clearErrorHighlights();
      errorList.value = [];
      saveResult.value = null;
    };

    const handleDeleteSelected = () => {
      if (!tabulator.value) return;
      const selectedRows = tabulator.value.getSelectedRows();
      for (const row of selectedRows) {
        const rowData = row.getData();
        const rowId = rowData.id as string;
        markDeleted(rowId);
        row.delete();
      }
    };

    return (): VNode => (
      <div class="mx-auto max-w-[1600px] p-6">
        <div class="mb-4">
          <h1 class="text-2xl font-bold text-highlighted">
            Compliance Library Editor — Prototype
          </h1>
          <p class="mt-1 text-sm text-muted">
            Paste from Excel (Ctrl+V), click Add Row to create manually, or edit cells
            directly. Use column header filters to search. Check rows to delete, then Save.
          </p>
        </div>

        {/* Toolbar */}
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <UButton
            label="Add Row"
            color="primary"
            variant="outline"
            onClick={handleAddRow}
          />
          <UButton
            label="Save"
            color="primary"
            loading={isSaving.value}
            disabled={dirtyCount.value === 0 && !errorList.value.length}
            onClick={handleSave}
          />
          <UButton
            label="Delete Selected"
            color="error"
            variant="ghost"
            onClick={handleDeleteSelected}
          />
          <UButton
            label="Export CSV"
            color="neutral"
            variant="outline"
            onClick={handleExportCSV}
          />
          <UButton
            label="Clear"
            color="neutral"
            variant="ghost"
            onClick={clearGrid}
          />
          <UButton
            label={showLicensePanel.value ? 'Hide Licensing' : 'Why Tabulator?'}
            color="info"
            variant="ghost"
            onClick={() => { showLicensePanel.value = !showLicensePanel.value; }}
          />
          <div class="ml-4 flex items-center gap-4 text-sm text-muted">
            <span>
              Dirty: <strong class="text-default">{dirtyCount.value}</strong>
            </span>
            <span>
              Errors: <strong class={errorCount.value > 0 ? 'text-error' : 'text-default'}>
                {errorCount.value}
              </strong>
            </span>
            {saveResult.value && saveResult.value.saved > 0 && (
              <UBadge
                color="success"
                label={`Saved ${saveResult.value.saved} rows`}
                variant="soft"
              />
            )}
          </div>
        </div>

        {/* Grid + Error sidebar */}
        <div class="flex gap-4">
          <div class="flex-1 overflow-hidden rounded-lg border border-default">
            <div ref={tableEl} />
          </div>

          {errorList.value.length > 0 && (
            <div class="w-80 flex-shrink-0">
              <h2 class="mb-2 text-sm font-semibold text-error">
                Validation Errors ({errorList.value.length})
              </h2>
              <div class="max-h-[460px] space-y-2 overflow-auto">
                {errorList.value.map((err, i) => (
                  <div
                    key={i}
                    class="cursor-pointer rounded border border-default bg-muted p-3 text-xs hover:bg-default"
                    onClick={() => scrollToError(err)}
                  >
                    <div class="font-semibold text-error">
                      Row {err.row + 1}: {err.field}
                    </div>
                    <div class="mt-1 text-muted">{err.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Licensing comparison panel (Ticket 14) */}
        {showLicensePanel.value && (
          <div class="mt-4 overflow-hidden rounded-lg border border-default">
            <div class="bg-muted px-4 py-2">
              <h2 class="text-sm font-semibold text-highlighted">
                Why Tabulator? — Feature & Licensing Comparison
              </h2>
              <p class="mt-1 text-xs text-muted">
                All features below are free in Tabulator (MIT). AG Grid and RevoGrid
                gate key features behind paid tiers. Source: ag-grid.com, rv-grid.com (verified Aug 2026).
              </p>
            </div>
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-4 py-2 text-left font-medium text-muted">Feature</th>
                  <th class="px-4 py-2 text-left font-medium text-success">Tabulator (MIT)</th>
                  <th class="px-4 py-2 text-left font-medium text-error">AG Grid</th>
                  <th class="px-4 py-2 text-left font-medium text-error">RevoGrid</th>
                </tr>
              </thead>
              <tbody>
                {LICENSE_COMPARISON.map((row, i) => (
                  <tr key={i} class="border-t border-default">
                    <td class="px-4 py-2 text-default font-medium">{row.feature}</td>
                    <td class="px-4 py-2 text-success">{row.tabulator}</td>
                    <td class="px-4 py-2 text-error">{row.agGrid}</td>
                    <td class="px-4 py-2 text-error">{row.revoGrid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <style>{`
          .backend-validation-error {
            background-color: #fee2e2 !important;
            border: 2px solid #ef4444 !important;
          }
          .tabulator-validation-fail {
            border: 2px solid #ef4444 !important;
          }
        `}</style>
      </div>
    );
  },
});
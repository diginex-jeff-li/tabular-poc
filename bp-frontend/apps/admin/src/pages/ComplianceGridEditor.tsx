/**
 * PROTOTYPE — Ticket 06: Validation error display loop
 *
 * The culmination of the prototype. Proves the full save loop:
 * 1. Admin pastes from Excel into the grid (Ticket 02)
 * 2. Grid columns derived from Zod schema (Ticket 05)
 * 3. Dirty tracking marks changed rows (Ticket 07)
 * 4. Admin clicks Save → POST to backend (Ticket 04)
 * 5. Backend validates with Zod, returns row-level errors
 * 6. Errors displayed per-cell + error sidebar
 * 7. Admin fixes errors → re-save → success
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
  watch,
  type VNode,
} from 'vue';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import { z } from 'zod';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';
import { useDirtyTracking } from 'composables/useDirtyTracking';

// ── Inline Zod schema (matches bp-contracts ComplianceLibrarySchema) ──
// In production this would import from 'bp-contracts'. For the prototype,
// we define it inline so the page is self-contained.

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

// Schema for upsert rows (no timestamps, backend assigns them)
const UpsertSchema = ComplianceLibrarySchema.omit({ createdAt: true, updatedAt: true });

type BackendError = { row: number; field: string; message: string };
type SaveResponse = { errors: BackendError[]; saved: number };

// ── Mock backend (simulates Ticket 04's PUT /compliance-library/bulk) ──
async function mockBulkSave(payload: {
  upserts: Record<string, unknown>[];
  deletes: string[];
}): Promise<SaveResponse> {
  // Simulate network delay
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

  if (errors.length > 0) {
    return { errors, saved: 0 };
  }

  return { errors: [], saved: payload.upserts.length + payload.deletes.length };
}

export default defineComponent({
  name: 'ComplianceGridEditor',
  setup() {
    const tableEl = ref<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabulator = shallowRef<any>(null);
    const isSaving = ref(false);
    const saveResult = ref<SaveResponse | null>(null);
    const errorList = ref<BackendError[]>([]);

    // Derive columns from Zod schema (id/createdAt/updatedAt are hidden)
    const columns = zodToTabulatorColumns(ComplianceLibrarySchema);

    // Dirty tracking
    const { dirtyCount, markDirty, buildSavePayload, clearDirty, markDeleted } =
      useDirtyTracking(tabulator);

    // ── Error display state ──
    const errorCount = computed(() => errorList.value.length);

    onMounted(() => {
      if (!tableEl.value) return;

      const opts = {
        data: [],
        reactiveData: true,
        columns: columns as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        clipboard: true,
        clipboardPasteParser: 'table',
        clipboardPasteAction: 'insert',
        clipboardCopyConfig: { columnHeaders: false },
        validationMode: 'highlight',
        height: '500px',
        layout: 'fitDataFill',
        movableColumns: true,
        autoColumns: false,
        selectable: true, // enable row selection for Delete Selected
        // Generate UUIDs for rows that don't have one (pasted rows)
        dataMutator: (data: Record<string, unknown>[]) => {
          return data.map((row) => {
            if (!row.id) {
              row.id = crypto.randomUUID();
            }
            return row;
          });
        },
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      tabulator.value = new Tabulator(tableEl.value, opts);

      // After paste, ensure all rows have UUIDs and mark them dirty
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
        // Mark all pasted rows as 'added' in dirty tracking
        for (const row of updated) {
          if (row.id) {
            markDirty(row.id as string, 'added');
          }
        }
      });

      // Expose for debugging — PROTOTYPE ONLY
      (window as any).__tabulator = tabulator.value; // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // ── Save loop ──
    const handleSave = async () => {
      if (!tabulator.value || isSaving.value) return;
      isSaving.value = true;
      errorList.value = [];
      saveResult.value = null;

      // Build diff payload from dirty tracking
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
          // Display errors per-cell + sidebar
          errorList.value = result.errors;
          applyErrorHighlights(result.errors);
        } else {
          // Success — clear dirty tracking
          clearDirty();
          clearErrorHighlights();
        }
      } catch {
        saveResult.value = { errors: [{ row: 0, field: 'network', message: 'Save failed' }], saved: 0 };
      } finally {
        isSaving.value = false;
      }
    };

    // ── Apply backend validation errors to grid cells ──
    function applyErrorHighlights(errors: BackendError[]) {
      if (!tabulator.value) return;

      // Clear previous highlights first
      clearErrorHighlights();

      const rows = tabulator.value.getRows();
      for (const err of errors) {
        const row = rows[err.row];
        if (!row) continue;

        const cell = row.getCell(err.field);
        if (!cell) continue;

        // Add CSS class for visual highlight
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

    // ── Click error to scroll to cell ──
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
          setTimeout(() => {
            el.style.outline = '';
          }, 2000);
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

    const handleDeleteRow = () => {
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
        {/* Header */}
        <div class="mb-4">
          <h1 class="text-2xl font-bold text-highlighted">
            Compliance Library Editor — Prototype
          </h1>
          <p class="mt-1 text-sm text-muted">
            Paste from Excel (Ctrl+V) — body rows only. Edit cells, then Save.
            Validation errors show as red borders + sidebar. Fix and re-save.
          </p>
        </div>

        {/* Toolbar */}
        <div class="mb-4 flex items-center gap-2">
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
            onClick={handleDeleteRow}
          />
          <UButton
            label="Clear"
            color="neutral"
            variant="ghost"
            onClick={clearGrid}
          />
          <div class="ml-4 flex items-center gap-4 text-sm text-muted">
            <span>
              Dirty: <strong class="text-default">{dirtyCount.value}</strong>
            </span>
            <span>
              Errors: <strong class={errorCount.value > 0 ? 'text-error' : 'text-default'}>{errorCount.value}</strong>
            </span>
            {saveResult.value && saveResult.value.saved > 0 && (
              <UBadge color="success" label={`Saved ${saveResult.value.saved} rows`} variant="soft" />
            )}
          </div>
        </div>

        {/* Grid + Error sidebar layout */}
        <div class="flex gap-4">
          {/* Grid */}
          <div class="flex-1 overflow-hidden rounded-lg border border-default">
            <div ref={tableEl} />
          </div>

          {/* Error sidebar */}
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

        {/* Inline styles for backend error highlighting */}
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
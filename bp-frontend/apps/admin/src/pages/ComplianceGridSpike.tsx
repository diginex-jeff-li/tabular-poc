/**
 * PROTOTYPE — Ticket 02: Tabulator TSX spike
 *
 * Throwaway code proving paste-from-Excel works in Tabulator with the
 * boilerplate's TSX convention. Not production. No backend, no Zod, no save.
 *
 * What this proves:
 * 1. Tabulator renders in TSX (defineComponent + setup + render VNode + div ref)
 * 2. Paste-from-Excel (Ctrl+V) populates rows with correct column mapping
 * 3. Cell editing: text for free-text, "list" (dropdown) for enums
 * 4. Validation: highlight mode flags invalid cells, getInvalidCells() works
 * 5. reactiveData: true syncs with Vue reactive array
 *
 * Note: @types/tabulator-tables@6.3.6 is outdated vs tabulator-tables@6.5.2.
 * The correct editor name for dropdowns is "list" (not "select"), confirmed
 * from the runtime source: defaultEditors = { input, textarea, number, range,
 * date, time, datetime, list, star, progress, tickCross, adaptable }.
 * The "in" validator also exists in the runtime but not in the old types.
 * We cast column defs through `as ColumnDefinition[]` to bridge the gap.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import {
  defineComponent,
  onMounted,
  ref,
  shallowRef,
  type VNode,
} from 'vue';
import { TabulatorFull as Tabulator } from 'tabulator-tables';

// ── Enum values (from Sample library.xlsx, verified via data extraction) ──

const CATEGORY_CODES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q',
];

const COMPLIANCE_CATEGORIES = ['Governance', 'Social', 'Environment'];

const TOPICS = [
  'Key Compliance Requirements', 'Zero Tolerance Policy', 'Freedom of Association',
  'Recruitment & Fees', 'Forced & Compulsory Labour', 'Wages & Benefits',
  'Working Hours', 'Occupational Safety & Health', 'Environmental Responsibility',
  'Grievance Mechanisms', 'Discrimination', 'Business Integrity',
  'Compliance Requirements', 'Community & Environment',
];

const RISK_LEVELS = ['High', 'Medium', 'Low'];

const CLOSURE_TIMINGS = ['7', '30', '60', '90', 'Next assessment'];

// ── Column definitions matching the 8 spreadsheet columns ──
// Cast through `any` because @types/tabulator-tables@6.3.6 doesn't know
// about the "list" editor or the "in" validator that exist at runtime in 6.5.

/* eslint-disable @typescript-eslint/no-explicit-any */
const columns = [
  {
    title: 'Category Code',
    field: 'categoryCode',
    width: 120,
    editor: 'list',
    editorParams: { values: CATEGORY_CODES },
    validator: ['required', { type: 'in', parameters: CATEGORY_CODES.join('|') }],
  },
  {
    title: 'Compliance Category',
    field: 'complianceCategory',
    width: 150,
    editor: 'list',
    editorParams: { values: COMPLIANCE_CATEGORIES },
    validator: ['required', { type: 'in', parameters: COMPLIANCE_CATEGORIES.join('|') }],
  },
  {
    title: 'Topic / Section',
    field: 'topic',
    width: 200,
    editor: 'list',
    editorParams: { values: TOPICS },
    validator: ['required', { type: 'in', parameters: TOPICS.join('|') }],
  },
  {
    title: 'Risk Level',
    field: 'riskLevel',
    width: 100,
    editor: 'list',
    editorParams: { values: RISK_LEVELS },
    validator: ['required', { type: 'in', parameters: RISK_LEVELS.join('|') }],
  },
  {
    title: 'Issue / Requirement',
    field: 'issue',
    width: 300,
    editor: 'input',
    validator: 'required',
  },
  {
    title: 'Closure Timing',
    field: 'closureTiming',
    width: 130,
    editor: 'list',
    editorParams: { values: CLOSURE_TIMINGS },
    validator: ['required', { type: 'in', parameters: CLOSURE_TIMINGS.join('|') }],
  },
  {
    title: 'Evidence Expectation',
    field: 'evidenceExpectation',
    width: 200,
    editor: 'input',
  },
  {
    title: 'Best Practice / Guidance',
    field: 'bestPractice',
    width: 300,
    editor: 'input',
  },
] as any;

/* eslint-enable @typescript-eslint/no-explicit-any */

export default defineComponent({
  name: 'ComplianceGridSpike',
  setup() {
    const tableEl = ref<HTMLDivElement | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabulator = shallowRef<any>(null);
    const rowCount = ref(0);
    const invalidCount = ref(0);
    const debugOutput = ref('');

    onMounted(() => {
      if (!tableEl.value) return;

      tabulator.value = new Tabulator(tableEl.value, {
        data: [],
        reactiveData: true,
        columns,
        clipboard: true,
        clipboardPasteParser: 'table',
        clipboardPasteAction: 'insert',
        clipboardCopyConfig: {
          columnHeaders: false,
        },
        validationMode: 'highlight',
        height: '600px',
        layout: 'fitDataFill',
        movableColumns: true,
      });

      // Expose for debugging — PROTOTYPE ONLY
      (window as unknown as { __tabulator?: unknown }).__tabulator = tabulator.value;

      // Track row count on data change
      tabulator.value.on('dataProcessed', () => {
        rowCount.value = tabulator.value?.getData().length ?? 0;
      });

      tabulator.value.on('clipboardPasted', () => {
        rowCount.value = tabulator.value?.getData().length ?? 0;
      });
    });

    const showState = () => {
      if (!tabulator.value) return;
      const data = tabulator.value.getData();
      const invalidCells = tabulator.value.getInvalidCells();

      rowCount.value = data.length;
      invalidCount.value = invalidCells.length;

      const invalidDetails = invalidCells.slice(0, 10).map((cell: unknown) => {
        const c = cell as {
          getField?: () => string;
          getValue?: () => unknown;
          getRow?: () => { getIndex?: () => unknown };
        };
        return {
          field: c.getField?.() ?? '?',
          value: c.getValue?.() ?? '?',
          rowIndex: c.getRow?.()?.getIndex?.() ?? '?',
        };
      });

      debugOutput.value = JSON.stringify(
        {
          rowCount: data.length,
          invalidCells: invalidCells.length,
          firstThreeRows: data.slice(0, 3),
          invalidDetails,
        },
        null,
        2,
      );
    };

    const clearGrid = () => {
      tabulator.value?.clearData();
      rowCount.value = 0;
      invalidCount.value = 0;
      debugOutput.value = '';
    };

    return (): VNode => (
      <div class="mx-auto max-w-[1400px] p-6">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-highlighted">
              Compliance Library Grid — Prototype
            </h1>
            <p class="mt-1 text-sm text-muted">
              Paste from Excel (Ctrl+V) — body rows only, no header. Then edit
              cells and click "Show State" to see validation results.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div class="mb-4 flex gap-2">
          <UButton
            label="Show State"
            color="primary"
            onClick={showState}
          />
          <UButton
            label="Clear Grid"
            color="neutral"
            variant="ghost"
            onClick={clearGrid}
          />
          <div class="ml-4 flex items-center gap-4 text-sm text-muted">
            <span>Rows: <strong class="text-default">{rowCount.value}</strong></span>
            <span>Invalid cells: <strong class="text-error">{invalidCount.value}</strong></span>
          </div>
        </div>

        {/* Grid */}
        <div class="overflow-hidden rounded-lg border border-default">
          <div ref={tableEl} />
        </div>

        {/* Debug panel */}
        {debugOutput.value && (
          <div class="mt-4">
            <h2 class="mb-2 text-sm font-semibold text-muted">Debug Output</h2>
            <pre class="max-h-80 overflow-auto rounded-lg border border-default bg-muted p-4 text-xs text-default">
              {debugOutput.value}
            </pre>
          </div>
        )}
      </div>
    );
  },
});
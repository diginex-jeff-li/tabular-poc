/**
 * PROTOTYPE — Bulk invite internal users (SC15-706 Scenario A) at /invite-users.
 *
 * Shows three ways to fill the same draft, all checked by one validator:
 * - Excel: download a template that carries its own data validation
 *   (dropdowns, email/uniqueness, name length), fill it, import it — imported
 *   rows land in the grid with their errors highlighted in place.
 * - Paste from Excel straight into the grid.
 * - An AI agent through WebMCP tools (or the `window.scInvite` bridge).
 *
 * "Send invites" is SIMULATED: it runs the batch check (schema, duplicate
 * emails in the batch, emails that already have accounts) and sends nothing.
 * The real bulk backend — atomicity, oversight approval, partial failure —
 * is not defined by SC15-706 or the single-invite contract.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import GridEditor from 'components/GridEditor';
import { useAgentTools } from 'composables/useAgentTools';
import { InviteRowSchema } from 'contracts';
import { createInviteTools } from 'utils/inviteAgentTools';
import { buildInviteWorkbook, parseInviteWorkbook } from 'utils/inviteWorkbook';
import { validateInvites } from 'utils/validateInvites';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';
import { defineComponent, onMounted, ref, type VNode } from 'vue';
import type { GridApi, GridSaveResponse } from 'composables/useGridEditor';

// Mock directory: these emails already have accounts in the organisation.
const EXISTING_EMAILS: ReadonlySet<string> = new Set([
  'jane.doe@acme.com',
  'tom.lee@acme.com',
  'admin@acme.com',
]);

const COLUMNS: Record<string, unknown>[] = [
  {
    title: '',
    field: '__select',
    width: 45,
    hozAlign: 'center',
    headerSort: false,
    clipboard: false,
    formatter: 'rowSelection',
    titleFormatter: 'rowSelection',
  },
  ...(zodToTabulatorColumns(InviteRowSchema) as unknown as Record<
    string,
    unknown
  >[]),
];

function downloadXlsx(data: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default defineComponent({
  name: 'BulkInviteUsers',
  setup() {
    let grid: GridApi | null = null;
    const fileInput = ref<HTMLInputElement | null>(null);
    const webmcp = ref(false);
    const notice = ref<string | null>(null);

    const validate = (rows: Record<string, unknown>[]) =>
      validateInvites(rows, EXISTING_EMAILS);
    useAgentTools(
      'scInvite',
      createInviteTools({ grid: () => grid, validate }),
    );
    onMounted(() => {
      webmcp.value = Boolean(document.modelContext ?? navigator.modelContext);
    });

    async function simulateSend(): Promise<GridSaveResponse> {
      const rows = grid?.getRows() ?? [];
      const errors = validate(rows);
      return errors.length > 0
        ? { errors, saved: 0 }
        : { errors: [], saved: rows.length };
    }

    async function importFile(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file || !grid) return;
      const { rows, ignoredHeaders } = await parseInviteWorkbook(
        await file.arrayBuffer(),
      );
      await grid.addRows(rows);
      const errors = validate(grid.getRows());
      grid.showErrors(errors);
      notice.value =
        `Imported ${rows.length} row(s) from ${file.name}; ${errors.length} error(s) to fix.` +
        (ignoredHeaders.length
          ? ` Ignored columns: ${ignoredHeaders.join(', ')}.`
          : '');
    }

    const toolbarActions = (): VNode[] => [
      <div class="mx-1 h-5 w-px bg-default" />,
      <UButton
        label="Download template"
        color="neutral"
        variant="outline"
        size="xs"
        onClick={async () =>
          downloadXlsx(
            await buildInviteWorkbook(),
            'invite-users-template.xlsx',
          )
        }
      />,
      <UButton
        label="Download as Excel"
        color="neutral"
        variant="ghost"
        size="xs"
        onClick={async () =>
          downloadXlsx(
            await buildInviteWorkbook(grid?.getRows() ?? []),
            'invite-users.xlsx',
          )
        }
      />,
      <UButton
        label="Import .xlsx"
        color="neutral"
        variant="outline"
        size="xs"
        onClick={() => fileInput.value?.click()}
      />,
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        class="hidden"
        data-testid="invite-import"
        onChange={importFile}
      />,
    ];

    return (): VNode => (
      <div class="flex h-full flex-col">
        <div class="shrink-0 space-y-2 border-b border-default p-3">
          <UAlert
            color={webmcp.value ? 'success' : 'neutral'}
            variant="soft"
            title={
              webmcp.value
                ? 'WebMCP: 6 agent tools registered on this page'
                : 'WebMCP not available in this browser — agent tools only via window.scInvite'
            }
            description="Agents can add, edit, delete and validate rows. Only you can click Send invites. Existing users for testing: jane.doe@acme.com, tom.lee@acme.com, admin@acme.com."
          />
          {notice.value && (
            <UAlert
              color="info"
              variant="soft"
              title={notice.value}
              close
              onUpdate:open={() => {
                notice.value = null;
              }}
            />
          )}
        </div>
        <div class="invite-grid min-h-0 flex-1">
          <GridEditor
            columns={COLUMNS}
            data={[]}
            onSave={simulateSend}
            onReady={(api: GridApi) => {
              grid = api;
            }}
            title="Bulk invite users"
            exportFilename="invite-users.csv"
            saveLabel="Send invites"
            savedLabel={(n: number) =>
              `Simulated — no invitations sent (${n} valid)`
            }
            toolbarActions={toolbarActions}
          />
        </div>
        {/* tabulator_modern paints even rows blue behind the cells; with only
            five columns the row is wider than its cells and the band shows. */}
        <style>{`.invite-grid .tabulator-row { background-color: transparent; }`}</style>
      </div>
    );
  },
});

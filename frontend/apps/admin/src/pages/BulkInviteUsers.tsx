/**
 * PROTOTYPE — Bulk invite internal users (SC15-706 Scenario A) at /invite-users.
 *
 * Shows three ways to fill the same invite draft, all checked by one
 * validator (vocabulary: CONTEXT.md):
 * - Excel: download a template that carries its own data validation
 *   (dropdowns, email/uniqueness, name length), fill it, import it.
 * - Paste from Excel straight into the grid.
 * - An AI agent through WebMCP tools (or the `window.scInvite` bridge).
 *
 * The rules (normalizing every way in, Status, agent proposed, unmapped
 * tables, the Send gate) live in the invite draft module
 * (`utils/inviteDraft.ts`); this page renders it and adapts the grid to it.
 * Only a person can confirm an agent-proposed row (its Confirm button, or
 * editing it).
 *
 * "Send invites" is SIMULATED: it runs the send checks and sends nothing.
 * The real bulk backend — atomicity, oversight approval, partial failure —
 * is not defined by SC15-706 or the single-invite contract.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UAlert from '@nuxt/ui/components/Alert.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import ColumnMappingPanel from 'components/ColumnMappingPanel';
import GridEditor from 'components/GridEditor';
import { useAgentTools } from 'composables/useAgentTools';
import { INVITE_TITLES, InviteRowSchema } from 'contracts';
import { normalizeInviteRow, type InviteRowStatus } from 'utils/draftRow';
import { createInviteTools } from 'utils/inviteAgentTools';
import { createInviteDraft } from 'utils/inviteDraft';
import { buildInviteWorkbook, parseInviteWorkbook } from 'utils/inviteWorkbook';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';
import { defineComponent, onMounted, ref, type VNode } from 'vue';
import type { GridApi } from 'composables/useGridEditor';

// Mock directory: these emails already have accounts in the organisation.
const EXISTING_EMAILS: ReadonlySet<string> = new Set([
  'jane.doe@acme.com',
  'tom.lee@acme.com',
  'admin@acme.com',
]);

const STATUS_CLASS: Record<InviteRowStatus, string> = {
  Ready: 'text-success',
  'Not ready': 'text-error',
  'Needs review': 'text-warning font-semibold',
  'Agent proposed': 'text-info font-semibold',
};

function buildColumns(
  statusOf: (row: Record<string, unknown>) => InviteRowStatus,
  confirm: (rowId: string) => void,
): Array<Record<string, unknown>> {
  return [
    {
      title: 'Status',
      field: 'status',
      frozen: true,
      width: 215,
      headerSort: false,
      clipboard: false,
      download: false,
      formatter: (cell: {
        getRow(): { getData(): Record<string, unknown> };
      }) => {
        const status = statusOf(cell.getRow().getData());
        const label = `<span class="${STATUS_CLASS[status]}">${status}</span>`;
        return status === 'Agent proposed'
          ? `${label} <button type="button" data-confirm class="ml-1 rounded border border-default px-1.5 text-xs hover:bg-muted">Confirm</button>`
          : label;
      },
      cellClick: (
        e: MouseEvent,
        cell: { getRow(): { getData(): Record<string, unknown> } },
      ) => {
        if ((e.target as HTMLElement).closest('[data-confirm]')) {
          confirm(String(cell.getRow().getData().id));
        }
      },
    },
    {
      title: '',
      field: '__select',
      width: 45,
      hozAlign: 'center',
      headerSort: false,
      clipboard: false,
      download: false,
      formatter: 'rowSelection',
      titleFormatter: 'rowSelection',
    },
    ...(zodToTabulatorColumns(InviteRowSchema, {
      titles: INVITE_TITLES,
    }) as unknown as Array<Record<string, unknown>>),
  ];
}

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
    const autoMatch = ref(true);

    const draft = createInviteDraft(() => grid, {
      existingEmails: EXISTING_EMAILS,
    });
    const columns = buildColumns(draft.status, draft.confirm);
    const tools = createInviteTools(draft);
    useAgentTools('scInvite', tools);
    onMounted(() => {
      webmcp.value = Boolean(document.modelContext ?? navigator.modelContext);
    });

    function pasteParser(
      clipboard: string,
      positional: () => Array<Record<string, unknown>>,
    ): Array<Record<string, unknown>> {
      const { rows, ignored } = draft.paste(
        clipboard,
        { autoMatch: autoMatch.value },
        positional,
      );
      if (ignored.length > 0) {
        notice.value = `Pasted by header name. Ignored columns: ${ignored.join(', ')}.`;
      }
      return rows;
    }

    async function applyMapping() {
      const { added, ignored } = await draft.applyMapping();
      notice.value =
        `Added ${added} pasted row(s); ${draft.errors().length} error(s) to fix.` +
        (ignored.length ? ` Ignored columns: ${ignored.join(', ')}.` : '');
    }

    async function importFile(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) {
        return;
      }
      const { rows, ignoredHeaders } = await parseInviteWorkbook(
        await file.arrayBuffer(),
      );
      await draft.add(rows, 'person');
      notice.value =
        `Imported ${rows.length} row(s) from ${file.name}; ${draft.errors().length} error(s) to fix.` +
        (ignoredHeaders.length
          ? ` Ignored columns: ${ignoredHeaders.join(', ')}.`
          : '');
    }

    const toolbarActions = (): Array<VNode> => [
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
      <label class="ml-2 flex items-center gap-1 text-xs text-muted">
        <input
          type="checkbox"
          checked={autoMatch.value}
          onChange={(e: Event) => {
            autoMatch.value = (e.target as HTMLInputElement).checked;
          }}
        />
        Auto-match headers
      </label>,
    ];

    return (): VNode => (
      <div class="flex h-full flex-col">
        <div class="shrink-0 space-y-2 border-b border-default p-3">
          <UAlert
            color={webmcp.value ? 'success' : 'neutral'}
            variant="soft"
            title={
              webmcp.value
                ? `WebMCP: ${tools.length} agent tools registered on this page`
                : 'WebMCP not available in this browser — agent tools only via window.scInvite'
            }
            description="Agents can add, edit, delete and validate rows, split lines that need review, and propose how a pasted table's columns map — a person confirms each of those. Only you can click Send invites. Existing users for testing: jane.doe@acme.com, tom.lee@acme.com, admin@acme.com."
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
          {draft.held.value && (
            <ColumnMappingPanel
              table={draft.held.value.table}
              mapping={draft.held.value.mapping}
              agentColumns={draft.held.value.agentColumns}
              onChange={draft.setMappingColumn}
              onApply={applyMapping}
              onDiscard={draft.discardMapping}
            />
          )}
        </div>
        <div class="invite-grid min-h-0 flex-1">
          <GridEditor
            columns={columns}
            data={[]}
            onSave={async () => draft.send()}
            normalizeRow={normalizeInviteRow}
            onUserEdit={draft.edited}
            pasteParser={pasteParser}
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

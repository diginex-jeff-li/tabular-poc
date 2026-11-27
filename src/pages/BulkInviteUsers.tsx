/**
 * PROTOTYPE — Bulk invite internal users (SC15-706 Scenario A) at /invite-users.
 *
 * Shows three ways to fill the same invite draft, all checked by one
 * validator (vocabulary: CONTEXT.md):
 * - Excel: download a template whose header notes give each column's rules
 *   (Role is a dropdown), fill it, import it.
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
import { useFileDialog, useObjectUrl } from '@vueuse/core';
import ColumnMappingPanel from 'components/ColumnMappingPanel';
import DataGrid from 'components/DataGrid';
import { useAgentTools } from 'composables/useAgentTools';
import { useInviteDraftStorage } from 'composables/useInviteDraftStorage';
import { INVITE_TITLES, InviteRowSchema } from 'contracts';
import { normalizeInviteRow } from 'utils/draftRow';
import { createInviteTools } from 'utils/inviteAgentTools';
import { createInviteDraft, describeOutcome } from 'utils/inviteDraft';
import { buildInviteWorkbook, readInviteWorkbook } from 'utils/inviteWorkbook';
import { zodToColumnDefs } from 'utils/zodToColumnDefs';
import {
  defineComponent,
  nextTick,
  onMounted,
  ref,
  shallowRef,
  Transition,
} from 'vue';
import type { GridApi, GridColumn } from 'utils/gridApi';
import type { InviteDraft } from 'utils/inviteDraft';
import type { InviteRowStatus } from 'utils/readyRows';
import type { VNode } from 'vue';

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

const STATUS_WIDTH = 215;

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Hoisted: a new object each render is a changed prop.
const COMPACT_ALERT = {
  root: 'gap-2 rounded-md px-3 py-2',
  icon: 'mt-px size-4',
  title: 'text-xs font-medium',
  description: 'mt-0.5 text-xs text-muted',
} as const;

/** TanStack columns: Status first and pinned, then the contract's fields. */
function gridColumns(draft: InviteDraft): Array<GridColumn> {
  return [
    {
      id: 'status',
      title: 'Status',
      width: STATUS_WIDTH,
      pinned: true,
      editor: null,
      paste: false,
      export: false,
      validate: () => null,
      render: (row) => {
        const status = draft.status(row);
        return (
          <span class="flex items-center gap-2">
            <span class={STATUS_CLASS[status]}>{status}</span>
            {status === 'Agent proposed' && (
              <UButton
                label="Confirm"
                size="xs"
                color="info"
                variant="soft"
                onClick={() => draft.confirm(row.id)}
              />
            )}
          </span>
        );
      },
    },
    ...zodToColumnDefs(InviteRowSchema, { titles: INVITE_TITLES }),
  ];
}

export default defineComponent({
  name: 'BulkInviteUsers',
  setup() {
    let grid: GridApi | null = null;
    const fileInput = ref<HTMLInputElement | null>(null);
    const webmcp = ref(false);
    const notice = ref<string | null>(null);
    const autoMatch = ref(true);
    // Notices and the mapping panel fade in after a pointer action; after a
    // paste (a keyboard shortcut) they appear without animation.
    const animatePanels = ref(true);

    const draft = createInviteDraft(() => grid, {
      existingEmails: EXISTING_EMAILS,
      // The draft survives a reload.
      store: useInviteDraftStorage(),
    });
    const tools = createInviteTools(draft);
    useAgentTools('scInvite', tools);
    onMounted(() => {
      webmcp.value = Boolean(document.modelContext ?? navigator.modelContext);
    });

    function pasteParser(
      clipboard: string,
      positional: () => Array<Record<string, unknown>>,
    ): Array<Record<string, unknown>> {
      const { rows, outcome } = draft.paste(
        clipboard,
        { autoMatch: autoMatch.value },
        positional,
      );
      animatePanels.value = false;
      notice.value = describeOutcome(outcome, 'paste');
      return rows;
    }

    function applyMapping() {
      animatePanels.value = true;
      notice.value = describeOutcome(draft.applyMapping(), 'mapping');
    }

    function discardMapping() {
      animatePanels.value = true;
      draft.discardMapping();
    }

    // The hidden input below stays the dialog (and the test hook); `reset`
    // clears it before each pick, so the same file can be imported again.
    const importDialog = useFileDialog({
      accept: '.xlsx',
      multiple: false,
      reset: true,
      input: fileInput,
    });
    importDialog.onChange((files) => void importFile(files?.[0]));

    async function importFile(file: File | undefined) {
      if (!file) {
        return;
      }
      const table = await readInviteWorkbook(await file.arrayBuffer());
      animatePanels.value = true;
      notice.value = describeOutcome(
        draft.importTable(table, { autoMatch: autoMatch.value }),
        { file: file.name },
      );
    }

    // The URL is made by useObjectUrl's watcher (hence the nextTick) and
    // revoked when the next download replaces the blob, or on unmount.
    const xlsx = shallowRef<Blob>();
    const xlsxUrl = useObjectUrl(xlsx);

    async function downloadXlsx(data: ArrayBuffer, filename: string) {
      xlsx.value = new Blob([data], { type: XLSX_TYPE });
      await nextTick();
      const link = document.createElement('a');
      link.href = xlsxUrl.value ?? '';
      link.download = filename;
      link.click();
    }

    const toolbarActions = (): Array<VNode> => [
      <div key="separator" class="mx-1 h-5 w-px shrink-0 bg-default" />,
      <UButton
        key="template"
        label="Download template"
        icon="i-lucide-file-spreadsheet"
        color="neutral"
        variant="ghost"
        size="xs"
        onClick={async () =>
          downloadXlsx(
            await buildInviteWorkbook(),
            'invite-users-template.xlsx',
          )
        }
      />,
      <UButton
        key="export"
        label="Download as Excel"
        icon="i-lucide-download"
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
        key="import"
        label="Import .xlsx"
        icon="i-lucide-upload"
        color="neutral"
        variant="ghost"
        size="xs"
        onClick={() => importDialog.open()}
      />,
      <input
        key="file"
        ref={fileInput}
        type="file"
        class="hidden"
        data-testid="invite-import"
      />,
      <label
        key="auto-match"
        class="ml-2 flex shrink-0 cursor-pointer items-center gap-1.5 text-xs whitespace-nowrap text-muted select-none"
      >
        <input
          type="checkbox"
          class="accent-(--ui-primary)"
          checked={autoMatch.value}
          onChange={(e: Event) => {
            autoMatch.value = (e.target as HTMLInputElement).checked;
          }}
        />
        Auto-match headers
      </label>,
    ];

    const gridProps = {
      data: [] as Array<Record<string, unknown>>,
      onSave: async () => draft.send(),
      normalizeRow: normalizeInviteRow,
      onUserEdit: draft.edited,
      pasteParser,
      onReady: (api: GridApi) => {
        grid = api;
        draft.resume();
      },
      title: 'Bulk invite users',
      exportFilename: 'invite-users.csv',
      saveLabel: 'Send invites',
      savedLabel: (n: number) => `Simulated — no invitations sent (${n} valid)`,
      toolbarActions,
    };

    const columns = gridColumns(draft);

    return (): VNode => (
      <div class="flex h-full flex-col">
        <div class="shrink-0 space-y-2 border-b border-default px-4 py-2.5">
          <UAlert
            color={webmcp.value ? 'success' : 'neutral'}
            variant="soft"
            icon={webmcp.value ? 'i-lucide-plug-zap' : 'i-lucide-plug'}
            ui={COMPACT_ALERT}
            title={
              webmcp.value
                ? `WebMCP: ${tools.length} agent tools registered on this page`
                : 'WebMCP not available in this browser — agent tools only via window.scInvite'
            }
            description="Agents can add, edit, delete and validate rows, split lines that need review, and propose how a pasted or imported table's columns map — a person confirms each of those. Only you can click Send invites. Existing users for testing: jane.doe@acme.com, tom.lee@acme.com, admin@acme.com."
          />
          <Transition name="rise" css={animatePanels.value}>
            {notice.value ? (
              <UAlert
                color="info"
                variant="soft"
                icon="i-lucide-info"
                ui={COMPACT_ALERT}
                title={notice.value}
                close
                onUpdate:open={() => {
                  animatePanels.value = true;
                  notice.value = null;
                }}
              />
            ) : null}
          </Transition>
          <Transition name="rise" css={animatePanels.value}>
            {draft.held.value ? (
              <ColumnMappingPanel
                held={draft.held.value}
                onChange={draft.setMappingColumn}
                onApply={applyMapping}
                onDiscard={discardMapping}
              />
            ) : null}
          </Transition>
        </div>
        <div class="min-h-0 flex-1">
          <DataGrid columns={columns} {...gridProps} />
        </div>
      </div>
    );
  },
});

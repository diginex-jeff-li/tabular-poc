/**
 * The bulk invite grid on Tabulator (comparison-only, `/tabulator/invite-users`).
 *
 * Lives apart from `BulkInviteUsers` so the page loads it, and with it every
 * Tabulator module, only on the Tabulator route.
 */
import GridEditor from 'components/GridEditor';
import { gridEngineProps } from 'components/gridEngineProps';
import { INVITE_TITLES, InviteRowSchema } from 'contracts';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';
import { defineComponent } from 'vue';
import type { InviteRowStatus } from 'utils/draftRow';
import type { InviteDraft } from 'utils/inviteDraft';
import type { PropType, VNode } from 'vue';

/** Status (frozen, formatter + cellClick), checkbox, then the contract's fields. */
function tabulatorColumns(
  draft: InviteDraft,
  statusClass: Record<InviteRowStatus, string>,
  statusWidth: number,
): Array<Record<string, unknown>> {
  return [
    {
      title: 'Status',
      field: 'status',
      frozen: true,
      width: statusWidth,
      headerSort: false,
      clipboard: false,
      download: false,
      formatter: (cell: {
        getRow(): { getData(): Record<string, unknown> };
      }) => {
        const status = draft.status(cell.getRow().getData());
        const label = `<span class="${statusClass[status]}">${status}</span>`;
        return status === 'Agent proposed'
          ? `${label} <button type="button" data-confirm class="ml-1 rounded border border-default px-1.5 text-xs hover:bg-muted">Confirm</button>`
          : label;
      },
      cellClick: (
        e: MouseEvent,
        cell: { getRow(): { getData(): Record<string, unknown> } },
      ) => {
        if ((e.target as HTMLElement).closest('[data-confirm]')) {
          draft.confirm(String(cell.getRow().getData().id));
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
      resizable: false,
      formatter: 'rowSelection',
      titleFormatter: 'rowSelection',
    },
    ...(zodToTabulatorColumns(InviteRowSchema, {
      titles: INVITE_TITLES,
    }) as unknown as Array<Record<string, unknown>>),
  ];
}

export default defineComponent({
  name: 'InviteTabulatorGrid',
  props: {
    ...gridEngineProps,
    draft: { type: Object as PropType<InviteDraft>, required: true },
    statusClass: {
      type: Object as PropType<Record<InviteRowStatus, string>>,
      required: true,
    },
    statusWidth: { type: Number, required: true },
  },
  setup(props) {
    const { draft, statusClass, statusWidth, ...grid } = props;
    const columns = tabulatorColumns(draft, statusClass, statusWidth);
    return (): Array<VNode> => [
      <GridEditor key="grid" {...grid} columns={columns} />,
      // tabulator_modern paints even rows blue behind the cells; with only
      // five columns the row is wider than its cells and the band shows.
      <style key="style">{`.invite-grid .tabulator-row { background-color: transparent; }`}</style>,
    ];
  },
});

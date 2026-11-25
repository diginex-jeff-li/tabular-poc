import type { GridApi, GridSaveResponse } from 'composables/useGridEditor';
import type { PropType, VNode } from 'vue';

/**
 * The props contract both grid engines (`GridEditor` on Tabulator, `DataGrid`
 * on TanStack) implement, so a page is written once and takes its engine as a
 * parameter. Each engine adds its own `columns` prop.
 */
export const gridEngineProps = {
  data: {
    type: Array as PropType<Array<Record<string, unknown>>>,
    required: true,
  },
  onSave: {
    type: Function as PropType<
      (payload: {
        upserts: Array<Record<string, unknown>>;
        deletes: Array<string>;
      }) => Promise<GridSaveResponse>
    >,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  exportFilename: {
    type: String,
    required: true,
  },
  toolbarActions: {
    type: Function as PropType<() => VNode | Array<VNode>>,
  },
  /** Save button label (e.g. "Send invites"). */
  saveLabel: {
    type: String,
    default: 'Save',
  },
  /** Success badge text for N saved rows. */
  savedLabel: {
    type: Function as PropType<(saved: number) => string>,
    default: (saved: number) => `Saved ${saved}`,
  },
  /** Receives the programmatic grid API (agent tools, file import). */
  onReady: {
    type: Function as PropType<(api: GridApi) => void>,
  },
  /** Applied to every row that enters or is edited in the grid. */
  normalizeRow: {
    type: Function as PropType<
      (row: Record<string, unknown>) => Record<string, unknown>
    >,
  },
  /** Called with row ids after a person adds, pastes, edits or deletes rows. */
  onUserEdit: {
    type: Function as PropType<(rowIds: Array<string>) => void>,
  },
  /** Replaces the positional paste parser. */
  pasteParser: {
    type: Function as PropType<
      (
        clipboard: string,
        positional: () => Array<Record<string, unknown>>,
      ) => Array<Record<string, unknown>>
    >,
  },
} as const;

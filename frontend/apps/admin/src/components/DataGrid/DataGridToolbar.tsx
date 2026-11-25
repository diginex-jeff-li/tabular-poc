/**
 * The DataGrid toolbar: row actions, Save, the status chips and the Clear
 * confirmation. All toolbar-only state renders here, so it never re-renders
 * the component that renders `UTable`.
 */
import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useConfirmDialog } from '@vueuse/core';
import { defineComponent } from 'vue';
import type { DataGridState } from 'composables/useDataGrid';
import type { PropType, VNode } from 'vue';

export default defineComponent({
  name: 'DataGridToolbar',
  props: {
    grid: { type: Object as PropType<DataGridState>, required: true },
    title: { type: String, required: true },
    saveLabel: { type: String, required: true },
    savedLabel: {
      type: Function as PropType<(saved: number) => string>,
      required: true,
    },
    toolbarActions: {
      type: Function as PropType<() => VNode | Array<VNode>>,
      default: undefined,
    },
  },
  setup(props) {
    const clearDialog = useConfirmDialog();

    async function confirmClear() {
      const { isCanceled } = await clearDialog.reveal();
      if (!isCanceled) {
        props.grid.clearAll();
      }
    }

    const renderStatus = (): VNode => {
      const { rowCount, dirtyCount, errorList, saveResult } = props.grid;
      const saved = saveResult.value?.saved ?? 0;
      return (
        <div
          class="ml-auto flex items-center gap-3 text-xs"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- toolbar status chips, not a calculation result (<output>)
          role="status"
          aria-live="polite"
        >
          <span class="text-muted">
            <strong class="text-default font-semibold">{rowCount.value}</strong>{' '}
            rows
          </span>
          {dirtyCount.value > 0 && (
            <span class="text-warning">
              <strong class="font-semibold">{dirtyCount.value}</strong>{' '}
              {dirtyCount.value === 1 ? 'change' : 'changes'}
            </span>
          )}
          {errorList.value.length > 0 && (
            <span class="text-error">
              <strong class="font-semibold">{errorList.value.length}</strong>{' '}
              errors
            </span>
          )}
          {saved > 0 && (
            <UBadge
              color="success"
              label={props.savedLabel(saved)}
              variant="soft"
              size="sm"
            />
          )}
        </div>
      );
    };

    return (): VNode => (
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-default bg-muted px-4">
        <h1 class="mr-4 text-sm font-semibold text-highlighted">
          {props.title}
        </h1>
        <UButton
          label="Add Row"
          color="primary"
          variant="outline"
          size="xs"
          onClick={props.grid.addRow}
        />
        <UButton
          label={props.saveLabel}
          color="primary"
          size="xs"
          loading={props.grid.isSaving.value}
          disabled={props.grid.dirtyCount.value === 0}
          onClick={props.grid.save}
        />
        <UButton
          label="Delete"
          color="error"
          variant="ghost"
          size="xs"
          onClick={props.grid.deleteSelected}
        />
        <div class="mx-1 h-5 w-px bg-default" />
        <UButton
          label="Clear"
          color="neutral"
          variant="ghost"
          size="xs"
          onClick={confirmClear}
        />
        {props.toolbarActions?.()}
        {renderStatus()}
        <UModal
          open={clearDialog.isRevealed.value}
          title="Clear all rows?"
          description={`This will remove all ${props.grid.rowCount.value} rows from the grid. Unsaved changes will be lost. Saved rows will remain in the backend store.`}
          onUpdate:open={(open: boolean) => {
            if (!open) {
              clearDialog.cancel();
            }
          }}
        >
          {{
            footer: (): VNode => (
              <div class="flex w-full justify-end gap-2">
                <UButton
                  label="Cancel"
                  color="neutral"
                  variant="ghost"
                  onClick={() => clearDialog.cancel()}
                />
                <UButton
                  label="Clear All"
                  color="error"
                  onClick={() => clearDialog.confirm()}
                />
              </div>
            ),
          }}
        </UModal>
      </div>
    );
  },
});

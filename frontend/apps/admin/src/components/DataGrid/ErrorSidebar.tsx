/**
 * Save errors beside the grid, as on the Tabulator engine: one entry per
 * backend error; clicking it shows the cell. A failed request (no response)
 * shows as a network entry with nothing to point at.
 */
import { rowLabel } from 'utils/gridApi';
import { computed, defineComponent } from 'vue';
import type { DataGridState } from 'composables/useDataGrid';
import type { GridSaveError } from 'utils/gridApi';
import type { PropType, VNode } from 'vue';

export default defineComponent({
  name: 'ErrorSidebar',
  props: {
    grid: { type: Object as PropType<DataGridState>, required: true },
    onPick: {
      type: Function as PropType<(error: GridSaveError) => void>,
      required: true,
    },
    /** The row's 1-based place in the grid as shown, or null when hidden. */
    rowNumber: {
      type: Function as PropType<(rowId: string) => number | null>,
      required: true,
    },
  },
  setup(props) {
    const networkErrors = computed(
      () =>
        props.grid.saveResult.value?.errors.filter(
          (error) => error.field === 'network',
        ) ?? [],
    );

    return (): VNode | null => {
      const errors = props.grid.errorList.value;
      if (errors.length === 0 && networkErrors.value.length === 0) {
        return null;
      }
      return (
        <div class="absolute right-0 top-0 z-10 w-80 max-h-full overflow-auto border-l border-default bg-default shadow-lg">
          <div class="sticky top-0 bg-error/10 px-3 py-2 border-b border-default">
            <h2 class="text-sm font-semibold text-error">
              Validation Errors ({errors.length})
            </h2>
          </div>
          <div class="space-y-2 p-3">
            {networkErrors.value.map((error) => (
              <div
                key="network"
                role="alert"
                class="rounded border border-default bg-muted p-3 text-xs"
              >
                <div class="font-semibold text-error">Network</div>
                <div class="mt-1 text-muted">{error.message}</div>
              </div>
            ))}
            {errors.map((error, i) => (
              <button
                key={i}
                type="button"
                class="block w-full cursor-pointer rounded border border-default bg-muted p-3 text-left text-xs hover:bg-default focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => props.onPick(error)}
              >
                <div class="font-semibold text-error">
                  {rowLabel(props.rowNumber(error.rowId))}: {error.field}
                </div>
                <div class="mt-1 text-muted">{error.message}</div>
              </button>
            ))}
          </div>
        </div>
      );
    };
  },
});

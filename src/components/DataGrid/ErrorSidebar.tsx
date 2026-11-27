/**
 * Save errors beside the grid: one entry per backend error; clicking it shows
 * the cell. A failed request (no response) shows as a network entry with
 * nothing to point at. The × hides the drawer; the cells keep their error
 * state, and `DataGrid` owns whether the drawer is open.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import { Transition, computed, defineComponent } from 'vue';
import type { DataGridState } from 'composables/useDataGrid';
import type { GridSaveError } from 'utils/gridApi';
import type { PropType, Ref, VNode } from 'vue';

/**
 * A row's 1-based place in the grid as shown; "Hidden row" when a filter
 * hides it, "Deleted row" when it is no longer in the grid.
 */
function rowLabel(rowNumber: number | null, inGrid: boolean): string {
  if (rowNumber !== null) {
    return `Row ${rowNumber}`;
  }
  return inGrid ? 'Hidden row' : 'Deleted row';
}

// Slides in from the edge it covers; leaves faster than it came. Under
// reduced motion only the opacity changes.
const MOTION = {
  enterActiveClass: 'transition-[translate,opacity] duration-300 ease-drawer',
  leaveActiveClass:
    'transition-[translate,opacity] duration-200 ease-out-strong',
  enterFromClass: 'translate-x-full opacity-0 motion-reduce:translate-x-0',
  leaveToClass: 'translate-x-full opacity-0 motion-reduce:translate-x-0',
} as const;

export default defineComponent({
  name: 'ErrorSidebar',
  props: {
    grid: { type: Object as PropType<DataGridState>, required: true },
    /** Read here, not in `DataGrid`'s render, so a toggle never re-renders `UTable`. */
    open: { type: Object as PropType<Readonly<Ref<boolean>>>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
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

    const renderDrawer = (): VNode => {
      const errors = props.grid.errorList.value;
      return (
        <aside
          aria-label="Validation errors"
          class="absolute right-0 top-0 z-10 w-80 max-h-full overflow-auto border-l border-default bg-default shadow-lg"
        >
          <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-default py-1.5 pl-3 pr-1.5">
            <span class="size-1.5 shrink-0 rounded-full bg-error" />
            <h2 class="flex-1 text-sm font-semibold text-highlighted">
              Validation Errors{' '}
              <span class="font-normal text-error">({errors.length})</span>
            </h2>
            <UButton
              icon="i-lucide-x"
              aria-label="Hide errors"
              color="neutral"
              variant="ghost"
              size="xs"
              onClick={props.onClose}
            />
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
                class="block w-full cursor-pointer rounded border border-default bg-muted p-3 text-left text-xs transition-transform duration-150 ease-out-strong hover:bg-elevated active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => props.onPick(error)}
              >
                <div class="font-semibold text-error">
                  {rowLabel(
                    props.rowNumber(error.rowId),
                    props.grid.rows.value.some((row) => row.id === error.rowId),
                  )}
                  : {error.field}
                </div>
                <div class="mt-1 text-muted">{error.message}</div>
              </button>
            ))}
          </div>
        </aside>
      );
    };

    return (): VNode => {
      const shown =
        props.open.value &&
        (props.grid.errorList.value.length > 0 ||
          networkErrors.value.length > 0);
      return (
        <Transition {...MOTION}>{shown ? renderDrawer() : null}</Transition>
      );
    };
  },
});

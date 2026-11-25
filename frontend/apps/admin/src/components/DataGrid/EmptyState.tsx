/**
 * The empty-grid overlay, as on the Tabulator engine. A press on it focuses
 * the grid, so the next Ctrl/Cmd+V pastes into it. Keyboard users reach the
 * grid with Tab; the overlay only covers it.
 */
import { defineComponent } from 'vue';
import type { DataGridState } from 'composables/useDataGrid';
import type { PropType, VNode } from 'vue';

export default defineComponent({
  name: 'EmptyState',
  props: {
    grid: { type: Object as PropType<DataGridState>, required: true },
    onActivate: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    return (): VNode | null =>
      props.grid.rowCount.value > 0 || props.grid.isSaving.value ? null : (
        <div
          role="presentation"
          data-testid="grid-empty"
          class="absolute inset-0 flex cursor-text flex-col items-center justify-center gap-3 bg-muted/80 backdrop-blur-sm"
          onClick={props.onActivate}
        >
          <div class="text-4xl text-muted">📋</div>
          <p class="text-lg font-medium text-default">
            Paste your Excel data here
          </p>
          <p class="text-sm text-muted">
            Click here, then press{' '}
            <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-xs font-mono">
              Ctrl+V
            </kbd>{' '}
            (
            <kbd class="rounded border border-default bg-default px-1.5 py-0.5 text-xs font-mono">
              ⌘V
            </kbd>{' '}
            on a Mac)
          </p>
          <p class="text-xs text-muted">
            or click “Add Row” to create manually
          </p>
        </div>
      );
  },
});

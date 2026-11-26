/**
 * A data column's header: title, a tristate sort button (asc → desc → none),
 * the column's filter, and a resize handle on its right edge. Only the sort
 * button sorts; a press anywhere else outside the controls selects the
 * column, and on a movable column a drag from there moves it.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { computed, defineComponent } from 'vue';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { Row } from 'composables/useDataGrid';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, Ref, VNode } from 'vue';

type HeaderContext = Parameters<
  Extract<NonNullable<TableColumn<Row>['header']>, (...args: never) => unknown>
>[0];
/** The TanStack header (and its column) behind a header cell. */
type TableHeader = HeaderContext['header'];

/** A header drag in progress, shared by every header of one grid. */
export interface ColumnDrag {
  /** The movable column the pointer is over while a drag is on. */
  over: Readonly<Ref<string | null>>;
  start: (colId: string, x: number) => void;
}

const SORT_ICONS = {
  asc: 'i-lucide-arrow-up-narrow-wide',
  desc: 'i-lucide-arrow-down-wide-narrow',
  none: 'i-lucide-arrow-up-down',
} as const;
const SORT_NEXT = {
  asc: 'descending',
  desc: 'none',
  none: 'ascending',
} as const;

/** Presses on these belong to the control, not to the header. */
const HEADER_CONTROLS = 'button,input,[role=combobox],[data-resize-handle]';

export default defineComponent({
  name: 'HeaderCell',
  props: {
    header: { type: Object as PropType<TableHeader>, required: true },
    def: { type: Object as PropType<GridColumn>, required: true },
    drag: { type: Object as PropType<ColumnDrag>, required: true },
    onSelectColumn: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const column = computed(() => props.header.column);
    const sorted = computed(() => column.value.getIsSorted() || 'none');
    const filterValue = computed(() => column.value.getFilterValue());
    const dropTarget = computed(() => props.drag.over.value === props.def.id);
    const setFilter = (value: unknown) => {
      column.value.setFilterValue(
        value === '' || value === null ? undefined : value,
      );
    };
    // TanStack's handler takes a mousedown or touchstart and follows the
    // pointer on the document until release.
    const resize = (e: MouseEvent | TouchEvent) => {
      e.stopPropagation();
      props.header.getResizeHandler()(e);
    };

    const renderFilter = (): VNode | null => {
      const def: GridColumn = props.def;
      if (def.filter === 'text') {
        return (
          <UInput
            size="xs"
            placeholder="Filter…"
            aria-label={`Filter ${def.title}`}
            modelValue={(filterValue.value as string | undefined) ?? ''}
            onUpdate:modelValue={setFilter}
          />
        );
      }
      if ('options' in def) {
        return (
          <USelectMenu
            size="xs"
            placeholder="All"
            aria-label={`Filter ${def.title}`}
            items={[...def.options]}
            searchInput={false}
            clear
            modelValue={(filterValue.value as string | undefined) ?? null}
            onUpdate:modelValue={setFilter}
          />
        );
      }
      return null;
    };

    return (): VNode => (
      <div
        data-header-id={props.def.id}
        class={[
          'relative flex select-none flex-col gap-1 px-3 py-2',
          !props.def.pinned && 'cursor-grab',
          dropTarget.value && 'shadow-[inset_3px_0_0_var(--ui-primary)]',
        ]}
        onPointerdown={(e: PointerEvent) => {
          if (
            e.button === 0 &&
            !(e.target as Element).closest(HEADER_CONTROLS)
          ) {
            props.onSelectColumn();
            if (!props.def.pinned) {
              props.drag.start(props.def.id, e.clientX);
            }
          }
        }}
      >
        <div class="flex items-center gap-1">
          <span class="truncate">{props.def.title}</span>
          {column.value.getCanSort() && (
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              class="shrink-0"
              icon={SORT_ICONS[sorted.value]}
              aria-label={`Sort ${props.def.title} ${SORT_NEXT[sorted.value]}`}
              data-sort={sorted.value}
              onClick={() => column.value.toggleSorting(undefined, false)}
            />
          )}
        </div>
        {renderFilter()}
        <div
          data-resize-handle
          aria-hidden="true"
          class="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-primary/40"
          onMousedown={resize}
          onTouchstart={resize}
          onDblclick={() => column.value.resetSize()}
        />
      </div>
    );
  },
});

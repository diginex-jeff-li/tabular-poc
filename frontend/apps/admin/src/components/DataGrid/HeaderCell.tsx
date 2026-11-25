/**
 * A data column's header: title, a tristate sort button (asc → desc → none)
 * and the column's filter. Only the sort button sorts; a press anywhere else
 * outside the controls selects the column.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { computed, defineComponent } from 'vue';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { Row } from 'composables/useDataGrid';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, VNode } from 'vue';

type HeaderContext = Parameters<
  Extract<NonNullable<TableColumn<Row>['header']>, (...args: never) => unknown>
>[0];
/** The TanStack column behind a header. */
export type TableColumnApi = HeaderContext['column'];

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

export default defineComponent({
  name: 'HeaderCell',
  props: {
    column: { type: Object as PropType<TableColumnApi>, required: true },
    def: { type: Object as PropType<GridColumn>, required: true },
    onSelectColumn: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const sorted = computed(() => props.column.getIsSorted() || 'none');
    const filterValue = computed(() => props.column.getFilterValue());
    const setFilter = (value: unknown) => {
      props.column.setFilterValue(
        value === '' || value === null ? undefined : value,
      );
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
        class="flex select-none flex-col gap-1 px-3 py-2"
        onPointerdown={(e: PointerEvent) => {
          if (
            e.button === 0 &&
            !(e.target as Element).closest('button,input,[role=combobox]')
          ) {
            props.onSelectColumn();
          }
        }}
      >
        <div class="flex items-center gap-1">
          <span class="truncate">{props.def.title}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            icon={SORT_ICONS[sorted.value]}
            aria-label={`Sort ${props.def.title} ${SORT_NEXT[sorted.value]}`}
            data-sort={sorted.value}
            onClick={() => props.column.toggleSorting(undefined, false)}
          />
        </div>
        {renderFilter()}
      </div>
    );
  },
});

/**
 * The toolbar's "Columns" menu: one checkbox per column to hide or show it.
 * Engine-neutral, so both grid engines render the same menu. A locked column
 * (the pinned Status) is listed but can't be hidden.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UDropdownMenu from '@nuxt/ui/components/DropdownMenu.vue';
import { computed, defineComponent } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui/components/DropdownMenu.vue';
import type { PropType, VNode } from 'vue';

export type ColumnVisibilityItem = {
  id: string;
  title: string;
  visible: boolean;
  locked?: boolean;
};

// Hoisted: a new object each render is a changed prop.
const CONTENT = { align: 'start' } as const;

export default defineComponent({
  name: 'ColumnVisibilityMenu',
  props: {
    columns: {
      type: Array as PropType<ReadonlyArray<ColumnVisibilityItem>>,
      required: true,
    },
    onToggle: {
      type: Function as PropType<(id: string, visible: boolean) => void>,
      required: true,
    },
  },
  setup(props) {
    const items = computed<Array<DropdownMenuItem>>(() =>
      props.columns.map((column) => ({
        type: 'checkbox',
        label: column.title,
        checked: column.visible,
        disabled: column.locked === true,
        onUpdateChecked: (checked: boolean) =>
          props.onToggle(column.id, checked),
        // Keep the menu open so several columns can be toggled in a row.
        onSelect: (e: Event) => e.preventDefault(),
      })),
    );
    return (): VNode => (
      <UDropdownMenu items={items.value} content={CONTENT}>
        <UButton
          label="Columns"
          icon="i-lucide-columns-3"
          color="neutral"
          variant="outline"
          size="xs"
        />
      </UDropdownMenu>
    );
  },
});

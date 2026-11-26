import { useEventListener } from '@vueuse/core';
import { computed, ref, shallowRef } from 'vue';
import type { ColumnDrag } from './HeaderCell';
import type { ColumnVisibilityItem } from 'components/ColumnVisibilityMenu';
import type { GridColumn } from 'utils/gridApi';
import type { ComputedRef, Ref } from 'vue';

/** The checkbox column's id. It sits right after the pinned columns. */
export const SELECT_ID = '__select';

/** How far the pointer must travel before a header press becomes a move. */
const MOVE_THRESHOLD = 4;

/** `UTable`'s controlled column state, in TanStack's shapes. */
export interface ColumnLayout {
  /** Pinned columns stay at the left edge while the grid scrolls sideways. */
  pinning: { left: Array<string>; right: Array<string> };
  columnOrder: Ref<Array<string>>;
  columnVisibility: Ref<Record<string, boolean>>;
  columnSizing: Ref<Record<string, number>>;
  /** Visible data column ids in screen order (no checkbox column). */
  colIds: ComputedRef<ReadonlyArray<string>>;
  /** A column's place among the header cells (`th`s), checkbox included; -1 when hidden. */
  thIndex: (colId: string) => number;
  /** The "Columns" menu's entries; pinned columns can't be hidden. */
  menu: ComputedRef<Array<ColumnVisibilityItem>>;
  setVisible: (colId: string, visible: boolean) => void;
  drag: ColumnDrag;
}

/**
 * Column order, visibility and widths for one grid, held here (not in the
 * table) and lost on reload. Pinned columns and the checkbox column stay
 * first: only unpinned data columns move, and only between each other.
 * A header press that travels past `MOVE_THRESHOLD` and is released over
 * another movable header moves the pressed column to that header's place.
 */
export function useColumnLayout(
  columns: ReadonlyArray<GridColumn>,
): ColumnLayout {
  const pinned = columns.flatMap((c) => (c.pinned ? [c.id] : []));
  const movable = new Set(columns.flatMap((c) => (c.pinned ? [] : [c.id])));
  const columnOrder = ref([...pinned, SELECT_ID, ...movable]);
  const columnVisibility = ref<Record<string, boolean>>({});
  const columnSizing = ref<Record<string, number>>({});
  const screenIds = computed(() =>
    columnOrder.value.filter((id) => columnVisibility.value[id] !== false),
  );

  function moveColumn(from: string, to: string) {
    const order = columnOrder.value;
    const next = order.filter((id) => id !== from);
    next.splice(order.indexOf(to), 0, from);
    columnOrder.value = next;
  }

  const pressed = shallowRef<{ colId: string; x: number } | null>(null);
  const over = ref<string | null>(null);
  useEventListener(
    window,
    'pointermove',
    (e: PointerEvent) => {
      const press = pressed.value;
      if (!press || Math.abs(e.clientX - press.x) < MOVE_THRESHOLD) {
        return;
      }
      const id = (e.target as Element)
        .closest?.('[data-header-id]')
        ?.getAttribute('data-header-id');
      over.value = id && id !== press.colId && movable.has(id) ? id : null;
    },
    { passive: true },
  );
  useEventListener(window, 'pointerup', () => {
    if (pressed.value && over.value) {
      moveColumn(pressed.value.colId, over.value);
    }
    pressed.value = null;
    over.value = null;
  });

  return {
    pinning: { left: pinned, right: [] },
    columnOrder,
    columnVisibility,
    columnSizing,
    colIds: computed(() => screenIds.value.filter((id) => id !== SELECT_ID)),
    thIndex: (colId) => screenIds.value.indexOf(colId),
    menu: computed(() =>
      columns.map((c) => ({
        id: c.id,
        title: c.title,
        visible: columnVisibility.value[c.id] !== false,
        locked: c.pinned === true,
      })),
    ),
    setVisible(colId, visible) {
      columnVisibility.value = { ...columnVisibility.value, [colId]: visible };
    },
    drag: {
      over,
      start(colId, x) {
        pressed.value = { colId, x };
      },
    },
  };
}

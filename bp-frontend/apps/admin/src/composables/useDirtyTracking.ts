import { ref, computed, watch, type Ref } from 'vue';
import type { TabulatorFull } from 'tabulator-tables';

export type DirtyStatus = 'added' | 'modified' | 'deleted' | 'unchanged';

export function useDirtyTracking(tabulatorRef: Ref<TabulatorFull | null>) {
  const dirtyMap = ref<Map<string, DirtyStatus>>(new Map());

  const dirtyCount = computed(() => dirtyMap.value.size);

  function markDirty(rowId: string, status: DirtyStatus) {
    const current = dirtyMap.value.get(rowId);

    // If already deleted, don't downgrade
    if (current === 'deleted' && status !== 'deleted') return;

    // If already modified and we're setting modified again, keep it
    if (current === 'modified' && status === 'modified') return;

    // If already added and we're setting added again, keep it
    if (current === 'added' && status === 'added') return;

    dirtyMap.value = new Map(dirtyMap.value).set(rowId, status);
  }

  function markDeleted(rowId: string) {
    const current = dirtyMap.value.get(rowId);

    // If the row was added (new, never saved), just remove it from tracking
    if (current === 'added') {
      const next = new Map(dirtyMap.value);
      next.delete(rowId);
      dirtyMap.value = next;
      return;
    }

    // Otherwise mark as deleted
    markDirty(rowId, 'deleted');
  }

  function buildSavePayload(): { upserts: Record<string, unknown>[]; deletes: string[] } {
    const tabulator = tabulatorRef.value;
    if (!tabulator) return { upserts: [], deletes: [] };

    const upserts: Record<string, unknown>[] = [];
    const deletes: string[] = [];

    const allRows = tabulator.getData() as Record<string, unknown>[];

    for (const [rowId, status] of dirtyMap.value) {
      if (status === 'deleted') {
        deletes.push(rowId);
      } else if (status === 'added' || status === 'modified') {
        // Find the current row data from the tabulator
        const rowData = allRows.find((r) => r.id === rowId);
        if (rowData) {
          upserts.push({ ...rowData });
        }
      }
    }

    return { upserts, deletes };
  }

  function clearDirty() {
    dirtyMap.value = new Map();
  }

  // ── Wire up Tabulator events ──
  watch(
    () => tabulatorRef.value,
    (tab, _prev, onCleanup) => {
      if (!tab) return;

      const onCellEdited = (cell: {
        getRow: () => { getData: () => Record<string, unknown>; getIndex: () => number };
        getField: () => string;
        getValue: () => unknown;
        getInitialValue: () => unknown;
      }) => {
        const rowData = cell.getRow().getData();
        const rowId = rowData.id as string | undefined;
        if (rowId) {
          markDirty(rowId, 'modified');
        }
      };

      const onRowAdded = (row: {
        getData: () => Record<string, unknown>;
        getIndex: () => number;
      }) => {
        const rowData = row.getData();
        const rowId = rowData.id as string | undefined;
        if (rowId) {
          markDirty(rowId, 'added');
        }
      };

      tab.on('cellEdited', onCellEdited);
      tab.on('rowAdded', onRowAdded);

      onCleanup(() => {
        tab.off('cellEdited', onCellEdited);
        tab.off('rowAdded', onRowAdded);
      });
    },
    { immediate: true },
  );

  return {
    dirtyMap,
    dirtyCount,
    markDirty,
    markDeleted,
    buildSavePayload,
    clearDirty,
  };
}

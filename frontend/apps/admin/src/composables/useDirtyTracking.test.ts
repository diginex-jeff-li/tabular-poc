import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { ref, nextTick } from 'vue';
import { useDirtyTracking } from './useDirtyTracking';
import type { TabulatorFull } from 'tabulator-tables';

// ── Mock Tabulator factory ──
// Tabulator uses an internal event emitter. We mock the `on` method to capture
// handlers and a `getData` method to return current row data.

interface MockRow {
  getData: () => Record<string, unknown>;
  getIndex: () => number;
  delete: () => void;
}

function createMockTabulator(initialData: Array<Record<string, unknown>> = []) {
  const handlers: Record<string, Array<(...args: Array<unknown>) => void>> = {};
  const data = [...initialData];

  const mockRows: Array<MockRow> = data.map((d, i) => ({
    getData: () => ({ ...d }),
    getIndex: () => i,
    delete: vi.fn(),
  }));

  const tabulator = {
    on: vi.fn((event: string, handler: (...args: Array<unknown>) => void) => {
      if (!handlers[event]) {
        handlers[event] = [];
      }
      handlers[event].push(handler);
    }),
    off: vi.fn(),
    getData: vi.fn(() => data),
    getRows: vi.fn(() => mockRows),
    addRow: vi.fn((rowData: Record<string, unknown>) => {
      const newRow = { ...rowData, id: rowData.id ?? `new-${data.length}` };
      data.push(newRow);
      const mockRow: MockRow = {
        getData: () => ({ ...newRow }),
        getIndex: () => data.length - 1,
        delete: vi.fn(),
      };
      mockRows.push(mockRow);
      return mockRow;
    }),
    // Helper to simulate events
    _emit: (event: string, ...args: Array<unknown>) => {
      // For rowAdded, also add to internal data so getData() reflects it
      if (event === 'rowAdded' && args[0]) {
        const row = args[0] as { getData: () => Record<string, unknown> };
        const rowData = row.getData();
        data.push(rowData);
        mockRows.push({
          getData: () => ({ ...rowData }),
          getIndex: () => data.length - 1,
          delete: vi.fn(),
        });
      }
      handlers[event]?.forEach((h) => h(...args));
    },
    _getData: () => data,
    _getMockRows: () => mockRows,
  };

  return tabulator;
}

// ── Helper to create a mock cell for cellEdited event ──
function createMockCell(rowData: Record<string, unknown>, rowIndex: number) {
  return {
    getData: () => ({ ...rowData }),
    getRow: () => ({
      getData: () => ({ ...rowData }),
      getIndex: () => rowIndex,
    }),
    getField: () => 'issue',
    getValue: () => rowData.issue,
    getInitialValue: () => 'old value',
  };
}

// ── Helper to create a mock row for rowAdded event ──
function createMockRow(rowData: Record<string, unknown>, rowIndex: number) {
  return {
    getData: () => ({ ...rowData }),
    getIndex: () => rowIndex,
  };
}

describe('useDirtyTracking', () => {
  let mockTab: ReturnType<typeof createMockTabulator>;

  beforeEach(() => {
    mockTab = createMockTabulator([
      { id: 'uuid-1', categoryCode: 'A', issue: 'Existing row 1' },
      { id: 'uuid-2', categoryCode: 'B', issue: 'Existing row 2' },
    ]);
  });

  it('initializes with empty dirty map', () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap } = useDirtyTracking(tabRef);
    expect(dirtyMap.value.size).toBe(0);
  });

  it('marks a row as modified on cellEdited event', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap } = useDirtyTracking(tabRef);

    const cell = createMockCell({ id: 'uuid-1', issue: 'Updated issue' }, 0);
    mockTab._emit('cellEdited', cell);

    await nextTick();
    expect(dirtyMap.value.get('uuid-1')).toBe('modified');
  });

  it('marks a row as added on rowAdded event', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap } = useDirtyTracking(tabRef);

    const row = createMockRow({ id: 'uuid-3', issue: 'New row' }, 2);
    mockTab._emit('rowAdded', row);

    await nextTick();
    expect(dirtyMap.value.get('uuid-3')).toBe('added');
  });

  it('marks a row as deleted via markDeleted()', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap, markDeleted } = useDirtyTracking(tabRef);

    markDeleted('uuid-1');

    await nextTick();
    expect(dirtyMap.value.get('uuid-1')).toBe('deleted');
  });

  it('removes an added row from tracking when deleted (no-op)', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap, markDeleted } = useDirtyTracking(tabRef);

    // First add
    const row = createMockRow({ id: 'uuid-new', issue: 'New row' }, 2);
    mockTab._emit('rowAdded', row);
    await nextTick();
    expect(dirtyMap.value.get('uuid-new')).toBe('added');

    // Then delete — should remove from tracking entirely
    markDeleted('uuid-new');
    await nextTick();
    expect(dirtyMap.value.has('uuid-new')).toBe(false);
  });

  it('keeps modified status when cellEdited fires again on same row', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap } = useDirtyTracking(tabRef);

    const cell1 = createMockCell({ id: 'uuid-1', issue: 'First edit' }, 0);
    mockTab._emit('cellEdited', cell1);
    await nextTick();

    const cell2 = createMockCell({ id: 'uuid-1', issue: 'Second edit' }, 0);
    mockTab._emit('cellEdited', cell2);
    await nextTick();

    expect(dirtyMap.value.get('uuid-1')).toBe('modified');
  });

  it('buildSavePayload returns empty arrays when nothing is dirty', () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { buildSavePayload } = useDirtyTracking(tabRef);

    const payload = buildSavePayload();
    expect(payload.upserts).toEqual([]);
    expect(payload.deletes).toEqual([]);
  });

  it('buildSavePayload separates upserts from deletes', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { markDeleted, buildSavePayload } = useDirtyTracking(tabRef);

    // Mark uuid-1 as modified
    const cell = createMockCell({ id: 'uuid-1', issue: 'Updated' }, 0);
    mockTab._emit('cellEdited', cell);

    // Mark uuid-2 as deleted
    markDeleted('uuid-2');

    // Add a new row
    const row = createMockRow({ id: 'uuid-3', issue: 'New row' }, 2);
    mockTab._emit('rowAdded', row);

    await nextTick();

    const payload = buildSavePayload();
    expect(payload.deletes).toContain('uuid-2');
    expect(payload.deletes).toHaveLength(1);

    const upsertIds = payload.upserts.map((u: Record<string, unknown>) => u.id);
    expect(upsertIds).toContain('uuid-1');
    expect(upsertIds).toContain('uuid-3');
    expect(payload.upserts).toHaveLength(2);
  });

  it('clearDirty resets the dirty map', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap, clearDirty } = useDirtyTracking(tabRef);

    const cell = createMockCell({ id: 'uuid-1', issue: 'Updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    expect(dirtyMap.value.size).toBe(1);

    clearDirty();
    await nextTick();
    expect(dirtyMap.value.size).toBe(0);
  });

  it('dirtyCount reflects number of dirty rows', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyCount, markDeleted } = useDirtyTracking(tabRef);

    expect(dirtyCount.value).toBe(0);

    const cell = createMockCell({ id: 'uuid-1', issue: 'Updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    expect(dirtyCount.value).toBe(1);

    markDeleted('uuid-2');
    await nextTick();
    expect(dirtyCount.value).toBe(2);
  });

  it('handles rows without an id field gracefully', async () => {
    const tabRef = ref(
      mockTab as unknown as InstanceType<typeof TabulatorFull>,
    );
    const { dirtyMap } = useDirtyTracking(tabRef);

    const cell = createMockCell({ issue: 'No id row' }, 0);
    mockTab._emit('cellEdited', cell);

    await nextTick();
    // Should not crash, and should not add to map
    expect(dirtyMap.value.size).toBe(0);
  });

  it('handles null tabulator gracefully', () => {
    const tabRef = ref(
      null as unknown as InstanceType<typeof TabulatorFull> | null,
    );
    const { dirtyMap, buildSavePayload, clearDirty, markDeleted } =
      useDirtyTracking(tabRef);

    expect(dirtyMap.value.size).toBe(0);
    expect(buildSavePayload()).toEqual({ upserts: [], deletes: [] });
    // Should not throw
    clearDirty();
    markDeleted('uuid-1');
  });
});

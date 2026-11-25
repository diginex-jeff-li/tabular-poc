import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import { effectScope, nextTick } from 'vue';
import { useDataGrid } from './useDataGrid';
import type { GridSaveResponse } from './useGridEditor';
import type { SavePayload } from 'utils/gridDiff';
import type { EffectScope } from 'vue';

// Each grid runs in its own scope, stopped after the test, so window
// listeners (beforeunload) never outlive their test.
const scopes: Array<EffectScope> = [];
const ok = (saved: number): GridSaveResponse => ({ errors: [], saved });

function setup(
  data: Array<Record<string, unknown>> = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bo' },
    { id: 'c', name: 'Cy' },
  ],
  onSave: (payload: SavePayload) => Promise<GridSaveResponse> = vi.fn(
    async (payload: SavePayload) =>
      ok(payload.upserts.length + payload.deletes.length),
  ),
) {
  const onUserEdit = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const grid = scope.run(() => useDataGrid({ data, onSave, onUserEdit }));
  return { grid, onSave, onUserEdit };
}

describe('useDataGrid', () => {
  afterEach(() => {
    for (const scope of scopes.splice(0)) {
      scope.stop();
    }
  });

  it('starts with the given rows in order, counted and clean', () => {
    const { grid } = setup([
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bo' },
    ]);
    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bo' },
    ]);
    expect(grid.rowCount.value).toBe(2);
    expect(grid.dirtyCount.value).toBe(0);
  });

  it('gives a row without an id a unique one and keeps its fields', () => {
    const { grid } = setup([{ name: 'Ann' }, { id: '', name: 'Bo' }]);
    const [ann, bo] = grid.rows.value;
    expect(ann).toMatchObject({ name: 'Ann', id: expect.any(String) });
    expect(bo).toMatchObject({ name: 'Bo', id: expect.any(String) });
    expect(ann.id).not.toBe('');
    expect(bo.id).not.toBe('');
    expect(ann.id).not.toBe(bo.id);
  });

  it('adds an empty row at the top and reports it as a person edit', () => {
    const { grid, onUserEdit } = setup();
    grid.addRow();
    const [top] = grid.rows.value;
    expect(Object.keys(top)).toEqual(['id']);
    expect(grid.rowCount.value).toBe(4);
    expect(grid.dirtyCount.value).toBe(1);
    expect(onUserEdit).toHaveBeenCalledWith([top.id]);
  });

  it('deletes only the ticked rows and saves them as deletes', async () => {
    const { grid, onSave, onUserEdit } = setup();
    grid.setRowSelected('a', true);
    grid.setRowSelected('c', true);
    grid.setRowSelected('c', false);
    grid.setRowSelected('b', true);
    grid.deleteSelected();
    expect(grid.rows.value.map((row) => row.id)).toEqual(['c']);
    expect(grid.rowSelection.value).toEqual({});
    expect(grid.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledWith(['a', 'b']);

    await grid.save();
    expect(onSave).toHaveBeenCalledWith({ upserts: [], deletes: ['a', 'b'] });
    expect(grid.dirtyCount.value).toBe(0);
    expect(grid.saveResult.value).toEqual(ok(2));
  });

  it('drops error entries of deleted rows', async () => {
    const { grid } = setup(undefined, async () => ({
      saved: 0,
      errors: [
        { row: 0, rowId: 'a', field: 'name', message: 'Bad' },
        { row: 1, rowId: 'b', field: 'name', message: 'Bad' },
      ],
    }));
    grid.addRow();
    await grid.save();
    expect(grid.errorList.value).toHaveLength(2);
    grid.setRowSelected('a', true);
    grid.deleteSelected();
    expect(grid.errorList.value.map((err) => err.rowId)).toEqual(['b']);
  });

  it('keeps the rows dirty when the backend reports errors', async () => {
    const errors = [{ row: 0, rowId: 'a', field: 'name', message: 'Bad' }];
    const { grid } = setup(undefined, async () => ({ saved: 0, errors }));
    grid.setRowSelected('a', true);
    grid.deleteSelected();
    await grid.save();
    expect(grid.errorList.value).toEqual(errors);
    expect(grid.dirtyCount.value).toBe(1);
  });

  it('records a network error entry when the save throws', async () => {
    const { grid } = setup(undefined, async () => {
      throw new Error('offline');
    });
    grid.addRow();
    await grid.save();
    expect(grid.saveResult.value).toEqual({
      saved: 0,
      errors: [{ row: 0, rowId: '', field: 'network', message: 'Save failed' }],
    });
    expect(grid.isSaving.value).toBe(false);
    expect(grid.dirtyCount.value).toBe(1);
  });

  it('does not call the backend when nothing changed', async () => {
    const { grid, onSave } = setup();
    await grid.save();
    expect(onSave).not.toHaveBeenCalled();
    expect(grid.saveResult.value).toEqual(ok(0));
  });

  it('keeps a change made while the save is in flight dirty', async () => {
    const response = Promise.withResolvers<GridSaveResponse>();
    const { grid } = setup(undefined, () => response.promise);
    grid.addRow();
    const saving = grid.save();
    grid.addRow();
    response.resolve(ok(1));
    await saving;
    expect(grid.dirtyCount.value).toBe(1);
  });

  it('clears the Saved badge when the next change appears', async () => {
    const { grid } = setup();
    grid.addRow();
    await grid.save();
    expect(grid.saveResult.value).toEqual(ok(1));
    await nextTick();
    expect(grid.saveResult.value).toEqual(ok(1));
    grid.addRow();
    await nextTick();
    expect(grid.saveResult.value).toBeNull();
  });

  it('clears every row; saved rows go out as deletes, unsaved ones nowhere', async () => {
    const { grid, onSave, onUserEdit } = setup();
    grid.addRow();
    grid.clearAll();
    expect(grid.rowCount.value).toBe(0);
    expect(grid.dirtyCount.value).toBe(3);
    expect(onUserEdit).toHaveBeenLastCalledWith([]);
    await grid.save();
    expect(onSave).toHaveBeenCalledWith({
      upserts: [],
      deletes: ['a', 'b', 'c'],
    });
  });

  it('warns before unload only while there are unsaved changes', () => {
    const { grid } = setup();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    grid.addRow();
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('rebuilds an edited row through normalizeRow and reports it once', () => {
    const onUserEdit = vi.fn();
    const scope = effectScope();
    scopes.push(scope);
    const grid = scope.run(() =>
      useDataGrid({
        data: [
          { id: 'a', name: 'Ann', role: 'admin' },
          { id: 'b', name: 'Bo', role: 'viewer' },
        ],
        onSave: vi.fn(),
        normalizeRow: (row) => ({ ...row, name: String(row.name).trim() }),
        onUserEdit,
      }),
    );
    const untouched = grid.rows.value[1];

    expect(grid.editCell({ rowId: 'a', colId: 'name' }, '  Anna ')).toBe(true);
    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Anna', role: 'admin' },
      { id: 'b', name: 'Bo', role: 'viewer' },
    ]);
    expect(grid.rows.value[1]).toBe(untouched);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['a']);
    expect(grid.dirtyCount.value).toBe(1);
  });

  it('does nothing when an edit keeps the value, blank included', () => {
    const { grid, onUserEdit } = setup([{ id: 'a', name: 'Ann', note: null }]);
    const before = grid.rows.value;
    expect(grid.editCell({ rowId: 'a', colId: 'name' }, 'Ann')).toBe(false);
    expect(grid.editCell({ rowId: 'a', colId: 'note' }, '')).toBe(false);
    expect(grid.editCell({ rowId: 'gone', colId: 'name' }, 'x')).toBe(false);
    expect(grid.rows.value).toBe(before);
    expect(onUserEdit).not.toHaveBeenCalled();
  });
});

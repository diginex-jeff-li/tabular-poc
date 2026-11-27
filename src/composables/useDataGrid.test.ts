import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import { effectScope, nextTick } from 'vue';
import { useDataGrid } from './useDataGrid';
import type { PasteParser } from './useDataGrid';
import type { GridColumn, GridSaveResponse } from 'utils/gridApi';
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
  options: Partial<Parameters<typeof useDataGrid>[0]> = {},
) {
  const onUserEdit = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const grid = scope.run(() =>
    useDataGrid({
      data,
      columns: [NAME],
      onSave,
      onUserEdit,
      ...options,
    }),
  );
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
        { rowId: 'a', field: 'name', message: 'Bad' },
        { rowId: 'b', field: 'name', message: 'Bad' },
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
    const errors = [{ rowId: 'a', field: 'name', message: 'Bad' }];
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
      errors: [{ rowId: '', field: 'network', message: 'Save failed' }],
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
        columns: [],
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

  it('appends pasted lines as rows with fresh ids through normalizeRow and reports them once', () => {
    const { grid, onUserEdit } = setup([{ id: 'a', name: 'Ann' }], undefined, {
      normalizeRow: (row) => ({ ...row, name: String(row.name).trim() }),
    });

    // No origin: nothing selected. The blank line adds no row.
    grid.paste(' Bo \n\nCy\n', { rowIds: ['a'], colIds: ['name'] });

    const ids = grid.rows.value.slice(1).map((row) => row.id);
    expect(new Set([...ids, 'a']).size).toBe(3);
    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Ann' },
      { id: ids[0], name: 'Bo' },
      { id: ids[1], name: 'Cy' },
    ]);
    expect(grid.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(ids);
  });

  it('appends what the pasteParser returns, each row with a fresh id', () => {
    const pasteParser = vi.fn<PasteParser>((_text, positional) => [
      ...positional(),
      { id: 'a', name: 'Di' },
    ]);
    const { grid, onUserEdit } = setup([{ id: 'a', name: 'Ann' }], undefined, {
      pasteParser,
    });

    grid.paste('Bo', { rowIds: ['a'], colIds: ['name'] });

    expect(pasteParser).toHaveBeenCalledWith('Bo', expect.any(Function));
    const ids = grid.rows.value.slice(1).map((row) => row.id);
    expect(new Set([...ids, 'a']).size).toBe(3);
    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Ann' },
      { id: ids[0], name: 'Bo' },
      { id: ids[1], name: 'Di' },
    ]);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(ids);
  });

  it('pastes over the grid from the origin in screen order, skipping read-only columns, as one undo step', () => {
    const { grid, onUserEdit } = setup(
      [
        { id: 'a', name: 'Ann', status: 'Ready', role: 'Viewer' },
        { id: 'b', name: 'Bo', status: 'Ready', role: 'Viewer' },
        { id: 'c', name: 'Cy', status: 'Ready', role: 'Viewer' },
      ],
      undefined,
      { columns: [NAME, STATUS, { ...TEXT, id: 'role' }] },
    );
    const before = grid.rows.value;
    // Sorted c before a; b is filtered out.
    const order = { rowIds: ['c', 'a'], colIds: ['name', 'status', 'role'] };

    grid.paste('Cyd\tOwner\nAnna\tAdmin\nEd\tViewer\n', order, {
      rowId: 'c',
      colId: 'name',
    });

    const added = grid.rows.value[3]?.id;
    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Anna', status: 'Ready', role: 'Admin' },
      { id: 'b', name: 'Bo', status: 'Ready', role: 'Viewer' },
      { id: 'c', name: 'Cyd', status: 'Ready', role: 'Owner' },
      { id: added, name: 'Ed', role: 'Viewer' },
    ]);
    expect(grid.rows.value[1]).toBe(before[1]);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['a', 'c', added]);

    expect(grid.undo()).toBe(true);
    expect(grid.rows.value).toBe(before);
  });

  it('fills the visible rows below a range with its editable cells, as one undo step', () => {
    const { grid, onUserEdit } = setup(
      [
        { id: 'a', name: 'Ann', status: 'Ready' },
        { id: 'b', name: 'Bo', status: 'Ready' },
        { id: 'c', name: 'Cy', status: 'Error' },
        { id: 'd', name: 'Di', status: 'Ready' },
      ],
      undefined,
      { columns: [NAME, STATUS] },
    );
    const before = grid.rows.value;
    // b is filtered out.
    const order = { rowIds: ['a', 'c', 'd'], colIds: ['name', 'status'] };
    const source = {
      anchor: { rowId: 'a', colId: 'name' },
      focus: { rowId: 'a', colId: 'status' },
    };

    grid.fillDrag(order, { source, toRowId: 'd' });

    expect(grid.rows.value).toEqual([
      { id: 'a', name: 'Ann', status: 'Ready' },
      { id: 'b', name: 'Bo', status: 'Ready' },
      { id: 'c', name: 'Ann', status: 'Error' },
      { id: 'd', name: 'Ann', status: 'Ready' },
    ]);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['c', 'd']);

    expect(grid.undo()).toBe(true);
    expect(grid.rows.value).toBe(before);
  });

  it('clears the editable cells of a block through normalizeRow and reports the touched rows once', () => {
    const normalizeRow = vi.fn((row: Record<string, unknown>) => ({
      ...row,
      full: [row.first, row.last].filter(Boolean).join(' '),
    }));
    const { grid, onUserEdit } = setup(
      [
        { id: 'a', status: 'Ready', first: 'Ann', last: 'Lee' },
        { id: 'b', status: 'Ready', first: '', last: 'Ng' },
        { id: 'c', status: 'Ready', first: 'Cy', last: 'Oh' },
      ],
      undefined,
      {
        normalizeRow,
        columns: [STATUS, { ...TEXT, id: 'first' }, { ...TEXT, id: 'last' }],
      },
    );
    const untouched = grid.rows.value[2];
    const block = ['a', 'b'].map((rowId) =>
      ['__select', 'status', 'first'].map((colId) => ({ rowId, colId })),
    );

    grid.clearCells(block);

    expect(grid.rows.value).toEqual([
      { id: 'a', status: 'Ready', first: null, last: 'Lee', full: 'Lee' },
      { id: 'b', status: 'Ready', first: '', last: 'Ng' },
      untouched,
    ]);
    expect(grid.rows.value[2]).toBe(untouched);
    expect(normalizeRow).toHaveBeenCalledWith({
      id: 'a',
      status: 'Ready',
      first: null,
      last: 'Lee',
    });
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['a']);

    const before = grid.rows.value;
    grid.clearCells(block);
    expect(grid.rows.value).toBe(before);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
  });

  describe('api (GridApi for agent tools and file import)', () => {
    function setupApi() {
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
          columns: [],
          normalizeRow: (row) => ({ ...row, name: String(row.name).trim() }),
          onUserEdit,
        }),
      );
      return { grid, api: grid.api, onUserEdit };
    }
    const error = (rowId: string) => ({
      rowId,
      field: 'name',
      message: 'Bad',
    });

    it('reads copies of the rows', () => {
      const { grid, api } = setupApi();
      const read = api.getRows();
      read[0].name = 'Changed';
      expect(read).toEqual([
        { id: 'a', name: 'Changed', role: 'admin' },
        { id: 'b', name: 'Bo', role: 'viewer' },
      ]);
      expect(grid.rows.value[0].name).toBe('Ann');
    });

    it('adds rows with fresh ids through normalizeRow, without reporting them', () => {
      const { api, onUserEdit } = setupApi();
      const ids = api.addRows([{ id: 'forged', name: ' Cy ' }]);
      expect(ids).toHaveLength(1);
      expect(ids[0]).not.toBe('forged');
      expect(api.getRows()[2]).toEqual({ id: ids[0], name: 'Cy' });
      expect(onUserEdit).not.toHaveBeenCalled();
    });

    it('imports rows as one person write: fresh ids through normalizeRow, reported once, one undo step after the ones before it', () => {
      const { grid, api, onUserEdit } = setupApi();
      grid.editCell({ rowId: 'a', colId: 'name' }, 'Anna');

      const ids = api.importRows([
        { id: 'forged', name: ' Cy ' },
        { name: 'Di' },
      ]);
      expect(ids).toHaveLength(2);
      expect(ids).not.toContain('forged');
      expect(api.getRows().slice(2)).toEqual([
        { id: ids[0], name: 'Cy' },
        { id: ids[1], name: 'Di' },
      ]);
      expect(onUserEdit).toHaveBeenCalledTimes(2);
      expect(onUserEdit).toHaveBeenLastCalledWith(ids);

      expect(grid.undo()).toBe(true);
      expect(api.getRows().map((r) => r.name)).toEqual(['Anna', 'Bo']);
      expect(grid.undo()).toBe(true);
      expect(api.getRows().map((r) => r.name)).toEqual(['Ann', 'Bo']);
      expect(grid.undo()).toBe(false);
    });

    it('merges patches through normalizeRow, reports unknown ids and counts as a change', () => {
      const { grid, api, onUserEdit } = setupApi();
      const untouched = grid.rows.value[1];
      const result = api.updateRows([
        { id: 'a', name: ' Anna ' },
        { id: 'gone', name: 'X' },
        { id: 'a', role: 'viewer' },
      ]);
      expect(result).toEqual({ updated: ['a', 'a'], missing: ['gone'] });
      expect(api.getRows()).toEqual([
        { id: 'a', name: 'Anna', role: 'viewer' },
        { id: 'b', name: 'Bo', role: 'viewer' },
      ]);
      expect(grid.rows.value[1]).toBe(untouched);
      expect(grid.dirtyCount.value).toBe(1);
      expect(onUserEdit).not.toHaveBeenCalled();
    });

    it('deletes by id, reports unknown ids and drops their ticks and errors', () => {
      const { grid, api, onUserEdit } = setupApi();
      grid.setRowSelected('a', true);
      grid.setRowSelected('b', true);
      api.showErrors([error('a'), error('b')]);

      expect(api.deleteRows(['a', 'gone', 'a'])).toEqual({
        deleted: ['a'],
        missing: ['gone', 'a'],
      });
      expect(api.getRows().map((r) => r.id)).toEqual(['b']);
      expect(grid.rowSelection.value).toEqual({ b: true });
      expect(grid.errorList.value).toEqual([error('b')]);
      expect(grid.dirtyCount.value).toBe(1);
      expect(onUserEdit).not.toHaveBeenCalled();
    });

    it('shows the given errors, replacing the previous ones', () => {
      const { grid, api } = setupApi();
      api.showErrors([error('a')]);
      api.showErrors([error('b')]);
      expect(grid.errorList.value).toEqual([error('b')]);
    });
  });

  describe('undo and redo', () => {
    it('undoes an edit back to the loaded data (0 changes) and redoes it, reporting the row each time', () => {
      const { grid, onUserEdit } = setup();
      grid.editCell({ rowId: 'b', colId: 'name' }, 'Bob');
      expect(grid.dirtyCount.value).toBe(1);

      expect(grid.undo()).toBe(true);
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Ann', 'Bo', 'Cy']);
      expect(grid.dirtyCount.value).toBe(0);
      expect(onUserEdit).toHaveBeenLastCalledWith(['b']);

      expect(grid.redo()).toBe(true);
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Ann', 'Bob', 'Cy']);
      expect(grid.dirtyCount.value).toBe(1);
      expect(onUserEdit).toHaveBeenLastCalledWith(['b']);
      expect(onUserEdit).toHaveBeenCalledTimes(3);
      expect(grid.redo()).toBe(false);
    });

    it('undoes a paste by removing its rows, and redo brings the same rows back', () => {
      const { grid, onUserEdit } = setup();
      grid.paste('Di\nEd', { rowIds: ['a', 'b', 'c'], colIds: ['name'] });
      const pasted = grid.rows.value.slice(3);

      grid.undo();
      expect(grid.rows.value.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      expect(onUserEdit).toHaveBeenLastCalledWith(pasted.map((r) => r.id));
      expect(grid.dirtyCount.value).toBe(0);

      grid.redo();
      expect(grid.rows.value.slice(3)).toEqual(pasted);
      expect(grid.dirtyCount.value).toBe(2);
    });

    it('undoes a Clear all, then a delete, one write at a time', () => {
      const { grid, onUserEdit } = setup();
      grid.setRowSelected('b', true);
      grid.deleteSelected();
      grid.clearAll();
      expect(grid.rowCount.value).toBe(0);

      grid.undo();
      expect(grid.rows.value.map((r) => r.id)).toEqual(['a', 'c']);
      expect(onUserEdit).toHaveBeenLastCalledWith(['a', 'c']);
      grid.undo();
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Ann', 'Bo', 'Cy']);
      expect(onUserEdit).toHaveBeenLastCalledWith(['b']);
      expect(grid.dirtyCount.value).toBe(0);
      expect(grid.undo()).toBe(false);
    });

    it('records and reports nothing for a write that changes nothing', () => {
      const { grid, onUserEdit } = setup();
      const order = { rowIds: ['a', 'b', 'c'], colIds: ['name'] };
      grid.editCell({ rowId: 'a', colId: 'name' }, 'Ann');
      grid.deleteSelected();
      grid.paste('', order);
      grid.paste('Ann\nBo', order, { rowId: 'a', colId: 'name' });
      grid.fillDrag(order, {
        source: {
          anchor: { rowId: 'a', colId: 'name' },
          focus: { rowId: 'b', colId: 'name' },
        },
        toRowId: 'b',
      });
      expect(grid.undo()).toBe(false);
      expect(onUserEdit).not.toHaveBeenCalled();

      const empty = setup([]);
      empty.grid.clearAll();
      expect(empty.grid.undo()).toBe(false);
      expect(empty.onUserEdit).not.toHaveBeenCalled();
    });

    it('an agent write empties both stacks and is never undone', () => {
      const { grid } = setup();
      grid.editCell({ rowId: 'a', colId: 'name' }, 'Anna');
      grid.editCell({ rowId: 'b', colId: 'name' }, 'Bob');
      grid.undo();

      grid.api.updateRows([{ id: 'c', name: 'Cyd' }]);

      expect(grid.undo()).toBe(false);
      expect(grid.redo()).toBe(false);
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Anna', 'Bo', 'Cyd']);
    });

    it('undoing a person write after an agent write never restores the rows before the agent write', () => {
      const { grid } = setup();
      grid.editCell({ rowId: 'a', colId: 'name' }, 'Anna');
      grid.api.updateRows([{ id: 'c', name: 'Cyd' }]);
      grid.editCell({ rowId: 'b', colId: 'name' }, 'Bob');

      expect(grid.undo()).toBe(true);
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Anna', 'Bo', 'Cyd']);
      expect(grid.undo()).toBe(false);
    });

    it('a new person write drops the redo stack', () => {
      const { grid } = setup();
      grid.editCell({ rowId: 'a', colId: 'name' }, 'Anna');
      grid.undo();
      grid.editCell({ rowId: 'b', colId: 'name' }, 'Bob');
      expect(grid.redo()).toBe(false);
      expect(grid.rows.value.map((r) => r.name)).toEqual(['Ann', 'Bob', 'Cy']);
    });
  });
});

const TEXT: GridColumn = {
  id: '',
  title: '',
  editor: 'text',
  validate: () => null,
  paste: true,
  export: true,
};
const NAME: GridColumn = { ...TEXT, id: 'name' };
const STATUS: GridColumn = {
  ...TEXT,
  id: 'status',
  editor: null,
};

import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import { computed, effectScope } from 'vue';
import { useDataGrid } from './useDataGrid';
import { useGridInteraction } from './useGridInteraction';
import { useGridSelection } from './useGridSelection';
import type { GridEffect, GridKey } from './useGridInteraction';
import type { GridColumn } from 'utils/gridApi';
import type { EffectScope } from 'vue';

const TEXT: GridColumn = {
  id: '',
  title: '',
  editor: 'text',
  validate: () => null,
  paste: true,
  export: true,
};
/** Read-only, first on screen. */
const STATUS: GridColumn = {
  ...TEXT,
  id: 'status',
  editor: null,
};
const TOPIC: GridColumn = { ...TEXT, id: 'topic' };
const RISK: GridColumn = { ...TEXT, id: 'risk' };

const NONE: GridEffect = {
  preventDefault: false,
  reveal: null,
  focusGrid: false,
};
const PREVENT: GridEffect = { ...NONE, preventDefault: true };

// Each grid runs in its own scope, stopped after the test.
const scopes: Array<EffectScope> = [];

function setup() {
  const onUserEdit = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const columns = [STATUS, TOPIC, RISK];
  return scope.run(() => {
    const grid = useDataGrid({
      data: [
        { id: 'r1', status: 'Ready', topic: 'Child labor', risk: 'Low' },
        { id: 'r2', status: 'Ready', topic: 'Wages', risk: 'High' },
        { id: 'r3', status: 'Ready', topic: 'Air quality', risk: 'High' },
      ],
      columns,
      onSave: vi.fn(async () => ({ errors: [], saved: 0 })),
      onUserEdit,
    });
    const order = computed(() => ({
      rowIds: grid.rows.value.map((row) => row.id),
      colIds: columns.map((c) => c.id),
    }));
    const selection = useGridSelection(order);
    const interaction = useGridInteraction({ selection, grid, columns, order });
    return { grid, selection, interaction, onUserEdit };
  });
}

/** A key typed on the grid unless `from` says otherwise. */
const key = (name: string, init: Partial<GridKey> = {}): GridKey => ({
  key: name,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  from: 'grid',
  ...init,
});

const pos = (rowId: string, colId: string) => ({ rowId, colId });

describe('useGridInteraction keys', () => {
  afterEach(() => {
    for (const scope of scopes.splice(0)) {
      scope.stop();
    }
  });

  it('the first move with no active cell selects the top-left cell; Tab leaves the grid', () => {
    const { selection, interaction } = setup();
    expect(interaction.keydown(key('Tab'))).toEqual(NONE);
    expect(selection.active.value).toBeNull();

    expect(interaction.keydown(key('ArrowDown'))).toEqual(PREVENT);
    expect(selection.active.value).toEqual(pos('r1', 'status'));
  });

  it('arrows step and reveal, Shift grows the range, Ctrl jumps to the edge', () => {
    const { selection, interaction } = setup();
    selection.select(pos('r1', 'topic'));

    expect(interaction.keydown(key('ArrowDown'))).toEqual({
      ...PREVENT,
      reveal: pos('r2', 'topic'),
    });
    expect(interaction.keydown(key('ArrowRight', { shiftKey: true }))).toEqual({
      ...PREVENT,
      reveal: pos('r2', 'risk'),
    });
    expect(selection.cells()).toEqual([
      [pos('r2', 'topic'), pos('r2', 'risk')],
    ]);

    expect(interaction.keydown(key('Home', { ctrlKey: true }))).toEqual({
      ...PREVENT,
      reveal: pos('r1', 'status'),
    });
    // At the edge an arrow still swallows the key, but reveals nothing.
    expect(interaction.keydown(key('ArrowUp'))).toEqual(PREVENT);
  });

  it('Tab moves right and Shift+Tab left without growing the range; at the row’s edge it leaves the grid', () => {
    const { selection, interaction } = setup();
    selection.select(pos('r1', 'topic'));

    expect(interaction.keydown(key('Tab'))).toEqual({
      ...PREVENT,
      reveal: pos('r1', 'risk'),
    });
    expect(interaction.keydown(key('Tab'))).toEqual(NONE);
    expect(selection.active.value).toEqual(pos('r1', 'risk'));

    expect(interaction.keydown(key('Tab', { shiftKey: true }))).toEqual({
      ...PREVENT,
      reveal: pos('r1', 'topic'),
    });
    expect(selection.cells()).toEqual([[pos('r1', 'topic')]]);
  });

  it('Enter opens the editor on the active cell, from its value', () => {
    const { selection, interaction } = setup();
    expect(interaction.keydown(key('Enter'))).toEqual(NONE);

    selection.select(pos('r2', 'topic'));
    expect(interaction.keydown(key('Enter'))).toEqual(PREVENT);
    expect(selection.state.value.editing).toEqual({
      pos: pos('r2', 'topic'),
      seed: null,
    });
  });

  it('typing a character opens the editor seeded with it; a shortcut does not', () => {
    const { selection, interaction } = setup();
    selection.select(pos('r2', 'topic'));
    expect(interaction.keydown(key('c', { ctrlKey: true }))).toEqual(NONE);
    expect(selection.state.value.editing).toBeNull();

    expect(interaction.keydown(key('P'))).toEqual(PREVENT);
    expect(selection.state.value.editing).toEqual({
      pos: pos('r2', 'topic'),
      seed: 'P',
    });
  });

  it('typing or Enter on a read-only column opens nothing', () => {
    const { selection, interaction } = setup();
    selection.select(pos('r1', 'status'));
    interaction.keydown(key('P'));
    interaction.keydown(key('Enter'));
    expect(selection.state.value.editing).toBeNull();
    expect(selection.active.value).toEqual(pos('r1', 'status'));
  });

  it('Backspace clears the editable cells of the range; Escape deselects', () => {
    const { grid, selection, interaction, onUserEdit } = setup();
    // Swallowed even with nothing to clear: some browsers go back.
    expect(interaction.keydown(key('Backspace'))).toEqual(PREVENT);
    expect(onUserEdit).not.toHaveBeenCalled();

    selection.select(pos('r1', 'status'));
    selection.select(pos('r1', 'topic'), true);
    expect(interaction.keydown(key('Delete'))).toEqual(PREVENT);
    expect(grid.rows.value[0]).toMatchObject({ status: 'Ready', topic: null });
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['r1']);

    expect(interaction.keydown(key('Escape'))).toEqual(NONE);
    expect(selection.active.value).toBeNull();
  });

  it('undo and redo work from outside the grid, but not in a text control', () => {
    const { grid, selection, interaction } = setup();
    selection.select(pos('r1', 'topic'));
    interaction.keydown(key('Delete'));

    expect(
      interaction.keydown(key('z', { metaKey: true, from: 'text' })),
    ).toEqual(NONE);
    expect(grid.rows.value[0].topic).toBeNull();

    expect(
      interaction.keydown(key('z', { metaKey: true, from: 'page' })),
    ).toEqual(PREVENT);
    expect(grid.rows.value[0].topic).toBe('Child labor');
    expect(interaction.keydown(key('y', { ctrlKey: true }))).toEqual(PREVENT);
    expect(grid.rows.value[0].topic).toBeNull();
  });

  it('only the grid’s own keys move or edit: a page or text key does nothing', () => {
    const { selection, interaction } = setup();
    selection.select(pos('r1', 'topic'));
    expect(interaction.keydown(key('ArrowDown', { from: 'page' }))).toEqual(
      NONE,
    );
    expect(interaction.keydown(key('x', { from: 'text' }))).toEqual(NONE);
    expect(selection.active.value).toEqual(pos('r1', 'topic'));
    expect(selection.state.value.editing).toBeNull();
  });
});

describe('useGridInteraction edits and releases', () => {
  afterEach(() => {
    for (const scope of scopes.splice(0)) {
      scope.stop();
    }
  });

  it('an edit end commits, steps and reveals, and a second end does nothing', () => {
    const { grid, selection, interaction, onUserEdit } = setup();
    interaction.startEdit(pos('r1', 'topic'), null);
    const end = { value: 'Fire safety', dir: 'down', refocus: true } as const;

    expect(interaction.endEdit(pos('r1', 'topic'), end)).toEqual({
      preventDefault: false,
      reveal: pos('r2', 'topic'),
      focusGrid: true,
    });
    expect(grid.rows.value[0].topic).toBe('Fire safety');
    expect(selection.active.value).toEqual(pos('r2', 'topic'));
    expect(selection.state.value.editing).toBeNull();

    // A blur after Enter finds the edit already ended.
    expect(
      interaction.endEdit(pos('r1', 'topic'), { ...end, refocus: false }),
    ).toEqual(NONE);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['r1']);
    expect(selection.active.value).toEqual(pos('r2', 'topic'));
  });

  it('a cancelled edit writes nothing; a blur does not take focus back', () => {
    const { grid, interaction, onUserEdit } = setup();
    interaction.startEdit(pos('r2', 'risk'), 'L');
    expect(
      interaction.endEdit(pos('r2', 'risk'), {
        value: null,
        dir: null,
        refocus: false,
      }),
    ).toEqual(NONE);
    expect(grid.rows.value[1].risk).toBe('High');
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('a release writes the fill once, as one undo step', () => {
    const { grid, selection, interaction, onUserEdit } = setup();
    selection.select(pos('r1', 'topic'));
    selection.press(pos('r1', 'topic'), {
      extend: false,
      target: 'fillHandle',
    });
    selection.enter(pos('r3', 'topic'));
    interaction.release();
    interaction.release();

    expect(grid.rows.value.map((row) => row.topic)).toEqual([
      'Child labor',
      'Child labor',
      'Child labor',
    ]);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['r2', 'r3']);
    grid.undo();
    expect(grid.rows.value.map((row) => row.topic)).toEqual([
      'Child labor',
      'Wages',
      'Air quality',
    ]);
  });
});

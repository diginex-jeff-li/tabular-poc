import type { GridApi, GridSaveError } from 'composables/useGridEditor';

/**
 * In-memory adapter for the `GridApi` seam (the Tabulator grid is the other
 * one). Lets the invite draft and the agent tools run without a browser.
 * `shown` records the last errors painted, as the grid would show them.
 */
export function createMemoryGrid(): GridApi & {
  rows: Array<Record<string, unknown>>;
  shown: Array<GridSaveError>;
} {
  let next = 0;
  const grid = {
    rows: [] as Array<Record<string, unknown>>,
    shown: [] as Array<GridSaveError>,
    getRows: () => grid.rows.map((r) => ({ ...r })),
    addRows: async (added: Array<Record<string, unknown>>) => {
      const ids = added.map(
        () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
      );
      added.forEach((r, i) => grid.rows.push({ ...r, id: ids[i] }));
      return ids;
    },
    updateRows: async (
      patches: Array<{ id: string } & Record<string, unknown>>,
    ) => {
      const result = {
        updated: [] as Array<string>,
        missing: [] as Array<string>,
      };
      for (const { id, ...fields } of patches) {
        const row = grid.rows.find((r) => r.id === id);
        if (row) {
          Object.assign(row, fields);
          result.updated.push(id);
        } else result.missing.push(id);
      }
      return result;
    },
    deleteRows: (ids: Array<string>) => {
      const result = {
        deleted: [] as Array<string>,
        missing: [] as Array<string>,
      };
      for (const id of ids) {
        const index = grid.rows.findIndex((r) => r.id === id);
        if (index < 0) result.missing.push(id);
        else
          result.deleted.push(
            ...grid.rows.splice(index, 1).map((r) => r.id as string),
          );
      }
      return result;
    },
    showErrors: (errors: Array<GridSaveError>) => {
      grid.shown = errors;
    },
  };
  return grid;
}

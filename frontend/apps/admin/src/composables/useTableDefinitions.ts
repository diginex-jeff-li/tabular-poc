import { useLocalStorage } from '@vueuse/core';
import { parseTableDefinitions, deleteTableData } from 'utils/tableStorage';
import type { ColumnDef, TableDefinition } from 'src/types/customTable';
import type { Ref } from 'vue';

const DEFINITIONS_KEY = 'sc-table-defs';

/**
 * Reactive CRUD over the table-definition list, built on VueUse
 * `useLocalStorage` so the list and editor pages share one reactive ref
 * within a tab without extra plumbing.
 *
 * The serializer's `read` is `parseTableDefinitions`, which is
 * corruption-tolerant: malformed JSON, a non-array payload, or
 * schema-invalid entries yield an empty array (or drop just the bad
 * entries) and never throw — so a corrupt `sc-table-defs` key never
 * white-screens the app.
 *
 * `deleteDefinition` also calls `deleteTableData(id)` so no data key
 * is orphaned when a table is removed.
 */
export function useTableDefinitions(): {
  definitions: Ref<Array<TableDefinition>>;
  getDefinition: (id: string) => TableDefinition | undefined;
  createDefinition: (
    name: string,
    columns: Array<ColumnDef>,
  ) => TableDefinition;
  updateDefinition: (
    id: string,
    patch: Partial<Omit<TableDefinition, 'id' | 'createdAt'>>,
  ) => void;
  deleteDefinition: (id: string) => void;
} {
  const definitions = useLocalStorage<Array<TableDefinition>>(
    DEFINITIONS_KEY,
    [],
    {
      serializer: {
        read: parseTableDefinitions,
        write: JSON.stringify,
      },
    },
  );

  function getDefinition(id: string): TableDefinition | undefined {
    return definitions.value.find((d) => d.id === id);
  }

  function createDefinition(
    name: string,
    columns: Array<ColumnDef>,
  ): TableDefinition {
    const now = new Date().toISOString();
    const definition: TableDefinition = {
      id: crypto.randomUUID(),
      name,
      // Each column gets a fresh uuid; existing column ids on the incoming
      // ColumnDef objects are replaced so the builder cannot leak a stale or
      // duplicate id.
      columns: columns.map((c) => ({ ...c, id: crypto.randomUUID() })),
      createdAt: now,
      updatedAt: now,
    };
    definitions.value = [...definitions.value, definition];
    return definition;
  }

  function updateDefinition(
    id: string,
    patch: Partial<Omit<TableDefinition, 'id' | 'createdAt'>>,
  ): void {
    definitions.value = definitions.value.map((d) =>
      d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
    );
  }

  function deleteDefinition(id: string): void {
    const exists = definitions.value.some((d) => d.id === id);
    if (!exists) return;
    definitions.value = definitions.value.filter((d) => d.id !== id);
    // Drop the table's row data too so no sc-table-data-{id} key is orphaned.
    deleteTableData(id);
  }

  return {
    definitions,
    getDefinition,
    createDefinition,
    updateDefinition,
    deleteDefinition,
  };
}

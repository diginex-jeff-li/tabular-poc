import { tableDataKey } from 'utils/tableStorage';
import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { nextTick } from 'vue';
import { useTableDefinitions } from './useTableDefinitions';
import type { ColumnDef, TableDefinition } from 'src/types/customTable';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';
const VALID_ISO = '2026-08-11T12:00:00.000Z';

function col(over: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: VALID_UUID,
    name: 'Status',
    type: 'text',
    required: false,
    choices: [],
    ...over,
  };
}

function def(over: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: VALID_UUID,
    name: 'My Table',
    columns: [col()],
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    ...over,
  };
}

describe('useTableDefinitions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('definitions ref', () => {
    it('is an empty array when no definitions are stored', () => {
      const { definitions } = useTableDefinitions();
      expect(definitions.value).toEqual([]);
    });

    it('reads existing definitions from sc-table-defs on init', async () => {
      const d = def();
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions } = useTableDefinitions();
      await nextTick();
      expect(definitions.value).toHaveLength(1);
      expect(definitions.value[0]).toEqual(d);
    });

    it('tolerates malformed JSON in sc-table-defs and returns []', async () => {
      localStorage.setItem('sc-table-defs', '{broken');
      const { definitions } = useTableDefinitions();
      await nextTick();
      expect(definitions.value).toEqual([]);
    });

    it('tolerates a non-array payload in sc-table-defs and returns []', async () => {
      localStorage.setItem('sc-table-defs', '{"not": "array"}');
      const { definitions } = useTableDefinitions();
      await nextTick();
      expect(definitions.value).toEqual([]);
    });

    it('drops schema-invalid entries and keeps valid ones', async () => {
      const valid = def({ id: VALID_UUID });
      const invalid = { foo: 'bar' };
      localStorage.setItem('sc-table-defs', JSON.stringify([valid, invalid]));
      const { definitions } = useTableDefinitions();
      await nextTick();
      expect(definitions.value).toHaveLength(1);
      expect(definitions.value[0]).toEqual(valid);
    });
  });

  describe('getDefinition', () => {
    it('returns the definition matching the id', async () => {
      const d = def({ id: VALID_UUID, name: 'Alpha' });
      const d2 = def({ id: OTHER_UUID, name: 'Beta' });
      localStorage.setItem('sc-table-defs', JSON.stringify([d, d2]));
      const { getDefinition } = useTableDefinitions();
      await nextTick();
      expect(getDefinition(VALID_UUID)?.name).toBe('Alpha');
      expect(getDefinition(OTHER_UUID)?.name).toBe('Beta');
    });

    it('returns undefined for an unknown id', async () => {
      const { getDefinition } = useTableDefinitions();
      await nextTick();
      expect(getDefinition('no-such-id')).toBeUndefined();
    });
  });

  describe('createDefinition', () => {
    it('assigns a uuid id, sets createdAt and updatedAt, and persists to sc-table-defs', async () => {
      const { definitions, createDefinition } = useTableDefinitions();
      const created = createDefinition('New Table', [col({ name: 'Title' })]);

      expect(created.id).toBeTruthy();
      // uuid v4 format
      expect(created.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(created.name).toBe('New Table');
      expect(created.createdAt).toBeTruthy();
      expect(created.updatedAt).toBeTruthy();
      expect(created.createdAt).toBe(created.updatedAt);
      expect(created.columns).toHaveLength(1);
      expect(created.columns[0].name).toBe('Title');

      // appears in the reactive list
      expect(definitions.value).toHaveLength(1);
      expect(definitions.value[0].id).toBe(created.id);

      await nextTick();
      const raw = localStorage.getItem('sc-table-defs');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(created.id);
      expect(parsed[0].name).toBe('New Table');
    });

    it('assigns a uuid id to each column', () => {
      const { createDefinition } = useTableDefinitions();
      const created = createDefinition('C', [
        col({ id: 'should-be-replaced', name: 'A' }),
        col({ id: 'also-replaced', name: 'B' }),
      ]);
      expect(created.columns).toHaveLength(2);
      for (const c of created.columns) {
        expect(c.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });

    it('persists alongside existing definitions without overwriting them', async () => {
      const existing = def({ id: VALID_UUID, name: 'Existing' });
      localStorage.setItem('sc-table-defs', JSON.stringify([existing]));
      const { definitions, createDefinition } = useTableDefinitions();
      await nextTick();
      createDefinition('New', [col({ name: 'X' })]);
      await nextTick();
      expect(definitions.value).toHaveLength(2);
      const names = definitions.value.map((d) => d.name).sort();
      expect(names).toEqual(['Existing', 'New']);
      const raw = localStorage.getItem('sc-table-defs');
      expect(JSON.parse(raw)).toHaveLength(2);
    });
  });

  describe('updateDefinition', () => {
    it('stamps a new updatedAt', async () => {
      const d = def({ id: VALID_UUID, updatedAt: '2020-01-01T00:00:00.000Z' });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions, updateDefinition } = useTableDefinitions();
      await nextTick();

      updateDefinition(VALID_UUID, { name: 'Renamed' });

      expect(definitions.value[0].name).toBe('Renamed');
      expect(definitions.value[0].updatedAt).not.toBe(
        '2020-01-01T00:00:00.000Z',
      );
      // updatedAt is now the current time, which is after the original
      expect(
        new Date(definitions.value[0].updatedAt).getTime(),
      ).toBeGreaterThan(new Date('2020-01-01T00:00:00.000Z').getTime());
      // createdAt is preserved (the seed's createdAt is VALID_ISO)
      expect(definitions.value[0].createdAt).toBe(VALID_ISO);

      await nextTick();
      const raw = localStorage.getItem('sc-table-defs');
      expect(JSON.parse(raw)[0].name).toBe('Renamed');
    });

    it('updates only the patched fields and leaves others alone', async () => {
      const d = def({ id: VALID_UUID, name: 'Original', createdAt: VALID_ISO });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions, updateDefinition } = useTableDefinitions();
      await nextTick();

      updateDefinition(VALID_UUID, { name: 'New Name' });

      expect(definitions.value[0].name).toBe('New Name');
      expect(definitions.value[0].createdAt).toBe(VALID_ISO);
      expect(definitions.value[0].id).toBe(VALID_UUID);
    });

    it('is a no-op for an unknown id', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions, updateDefinition } = useTableDefinitions();
      await nextTick();

      updateDefinition('no-such-id', { name: 'X' });

      expect(definitions.value).toHaveLength(1);
      expect(definitions.value[0].name).toBe('My Table');
    });
  });

  describe('deleteDefinition', () => {
    it('removes the definition from the reactive list', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions, deleteDefinition } = useTableDefinitions();
      await nextTick();

      deleteDefinition(VALID_UUID);

      expect(definitions.value).toHaveLength(0);
    });

    it('removes the definition from sc-table-defs', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { deleteDefinition } = useTableDefinitions();
      await nextTick();

      deleteDefinition(VALID_UUID);
      await nextTick();

      const raw = localStorage.getItem('sc-table-defs');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw)).toHaveLength(0);
    });

    it('also removes sc-table-data-{id} so no data key is orphaned', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      localStorage.setItem(
        tableDataKey(VALID_UUID),
        JSON.stringify([
          { id: VALID_UUID, createdAt: VALID_ISO, updatedAt: VALID_ISO },
        ]),
      );
      const { deleteDefinition } = useTableDefinitions();
      await nextTick();

      expect(localStorage.getItem(tableDataKey(VALID_UUID))).not.toBeNull();
      deleteDefinition(VALID_UUID);
      await nextTick();
      expect(localStorage.getItem(tableDataKey(VALID_UUID))).toBeNull();
    });

    it('leaves other tables definitions and data untouched', async () => {
      const d1 = def({ id: VALID_UUID, name: 'Alpha' });
      const d2 = def({ id: OTHER_UUID, name: 'Beta' });
      localStorage.setItem('sc-table-defs', JSON.stringify([d1, d2]));
      localStorage.setItem(
        tableDataKey(VALID_UUID),
        JSON.stringify([
          { id: VALID_UUID, createdAt: VALID_ISO, updatedAt: VALID_ISO },
        ]),
      );
      localStorage.setItem(
        tableDataKey(OTHER_UUID),
        JSON.stringify([
          { id: OTHER_UUID, createdAt: VALID_ISO, updatedAt: VALID_ISO },
        ]),
      );
      const { definitions, deleteDefinition } = useTableDefinitions();
      await nextTick();

      deleteDefinition(VALID_UUID);
      await nextTick();

      expect(definitions.value).toHaveLength(1);
      expect(definitions.value[0].name).toBe('Beta');
      expect(localStorage.getItem(tableDataKey(VALID_UUID))).toBeNull();
      expect(localStorage.getItem(tableDataKey(OTHER_UUID))).not.toBeNull();
      const raw = localStorage.getItem('sc-table-defs');
      expect(JSON.parse(raw)).toHaveLength(1);
      expect(JSON.parse(raw)[0].id).toBe(OTHER_UUID);
    });

    it('is a no-op for an unknown id', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const { definitions, deleteDefinition } = useTableDefinitions();
      await nextTick();

      deleteDefinition('no-such-id');
      await nextTick();

      expect(definitions.value).toHaveLength(1);
    });
  });

  describe('shared reactive ref across two call sites', () => {
    it('two separate useTableDefinitions() calls observe the same reactive list', async () => {
      const a = useTableDefinitions();
      const b = useTableDefinitions();
      await nextTick();

      expect(a.definitions.value).toEqual(b.definitions.value);
      expect(a.definitions.value).toHaveLength(0);

      a.createDefinition('From A', [col({ name: 'Col1' })]);
      await nextTick();

      expect(a.definitions.value).toHaveLength(1);
      expect(b.definitions.value).toHaveLength(1);
      expect(b.definitions.value[0].name).toBe('From A');
    });

    it('a delete in one call site is reflected in the other', async () => {
      const d = def({ id: VALID_UUID });
      localStorage.setItem('sc-table-defs', JSON.stringify([d]));
      const a = useTableDefinitions();
      const b = useTableDefinitions();
      await nextTick();

      a.deleteDefinition(VALID_UUID);
      await nextTick();

      expect(a.definitions.value).toHaveLength(0);
      expect(b.definitions.value).toHaveLength(0);
    });
  });
});

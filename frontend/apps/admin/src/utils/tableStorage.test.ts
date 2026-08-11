import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tableDataKey,
  parseTableDefinitions,
  parseTableRows,
  readTableRows,
  writeTableRows,
  deleteTableData,
} from './tableStorage';
import type { ColumnDef, TableDefinition, TableRow } from 'src/types/customTable';

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

function row(over: Partial<TableRow> = {}): TableRow {
  return {
    id: VALID_UUID,
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    ...over,
  };
}

describe('tableStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('tableDataKey', () => {
    it('produces the sc-table-data-{tableId} key', () => {
      expect(tableDataKey('abc-123')).toBe('sc-table-data-abc-123');
    });

    it('handles uuid-shaped ids', () => {
      expect(tableDataKey(VALID_UUID)).toBe(`sc-table-data-${VALID_UUID}`);
    });
  });

  describe('parseTableDefinitions — corruption tolerance', () => {
    it('returns an empty array for null', () => {
      expect(parseTableDefinitions(null)).toEqual([]);
    });

    it('returns an empty array for malformed JSON without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions('{broken');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for valid JSON that is not an array (object)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions('{"not": "an array"}');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for valid JSON that is a string', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions('"hello"');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for valid JSON that is a number', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions('42');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for an empty array', () => {
      expect(parseTableDefinitions('[]')).toEqual([]);
    });

    it('returns a valid single-entry array unchanged', () => {
      const d = def();
      const result = parseTableDefinitions(JSON.stringify([d]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(d);
    });

    it('returns all entries from a valid multi-entry array', () => {
      const d1 = def({ id: VALID_UUID });
      const d2 = def({ id: OTHER_UUID, name: 'Other' });
      const result = parseTableDefinitions(JSON.stringify([d1, d2]));
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(d1);
      expect(result[1]).toEqual(d2);
    });

    it('drops a schema-invalid entry and keeps only the valid one', () => {
      const valid = def({ id: VALID_UUID });
      // missing required fields (id, name, columns, createdAt, updatedAt)
      const invalid = { foo: 'bar' };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions(JSON.stringify([valid, invalid]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('drops an entry with a bad uuid and keeps the valid one', () => {
      const valid = def({ id: VALID_UUID });
      const invalid = def({ id: 'not-a-uuid' });
      const result = parseTableDefinitions(JSON.stringify([valid, invalid]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
    });

    it('drops an entry with a bad datetime and keeps the valid one', () => {
      const valid = def({ id: VALID_UUID });
      const invalid = def({ id: OTHER_UUID, createdAt: 'nope' });
      const result = parseTableDefinitions(JSON.stringify([valid, invalid]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
    });

    it('returns an empty array when all entries are invalid', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableDefinitions(JSON.stringify([{ a: 1 }, { b: 2 }]));
      expect(result).toEqual([]);
      warnSpy.mockRestore();
    });

    it('never throws — returns [] even for deeply broken input', () => {
      expect(() => parseTableDefinitions('}}}')).not.toThrow();
      expect(() => parseTableDefinitions('undefined')).not.toThrow();
      expect(() => parseTableDefinitions('NaN')).not.toThrow();
    });
  });

  describe('parseTableRows — corruption tolerance', () => {
    it('returns an empty array for null', () => {
      expect(parseTableRows(null)).toEqual([]);
    });

    it('returns an empty array for malformed JSON without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableRows('{broken');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for valid JSON that is not an array (object)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableRows('{"not": "an array"}');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns an empty array for valid JSON that is a string', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableRows('"hello"');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns a valid single-entry array unchanged', () => {
      const r = row({ Title: 'Hello' });
      const result = parseTableRows(JSON.stringify([r]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(r);
    });

    it('drops a schema-invalid row and keeps only the valid one', () => {
      const valid = row({ id: VALID_UUID, Title: 'Hello' });
      // missing id, createdAt, updatedAt
      const invalid = { Title: 'NoMeta' };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseTableRows(JSON.stringify([valid, invalid]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('drops a row with a bad uuid and keeps the valid one', () => {
      const valid = row({ id: VALID_UUID });
      const invalid = row({ id: 'not-a-uuid' });
      const result = parseTableRows(JSON.stringify([valid, invalid]));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
    });

    it('preserves arbitrary extra keys (passthrough) on valid rows', () => {
      const r = row({ Title: 'Hello', Score: 42 });
      const result = parseTableRows(JSON.stringify([r]));
      expect(result).toHaveLength(1);
      expect(result[0].Title).toBe('Hello');
      expect((result[0] as Record<string, unknown>).Score).toBe(42);
    });

    it('never throws — returns [] even for deeply broken input', () => {
      expect(() => parseTableRows('}}}')).not.toThrow();
      expect(() => parseTableRows('undefined')).not.toThrow();
      expect(() => parseTableRows('NaN')).not.toThrow();
    });
  });

  describe('readTableRows', () => {
    it('returns an empty array when no data key exists', () => {
      expect(readTableRows('abc-123')).toEqual([]);
    });

    it('reads rows written via writeTableRows', () => {
      const r = row({ id: VALID_UUID, Title: 'Hello' });
      writeTableRows('abc-123', [r]);
      const result = readTableRows('abc-123');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(r);
    });

    it('returns an empty array for a malformed data key without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(tableDataKey('abc-123'), '{broken');
      const result = readTableRows('abc-123');
      expect(result).toEqual([]);
      warnSpy.mockRestore();
    });

    it('returns an empty array for a non-array data key without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(tableDataKey('abc-123'), '{"not": "array"}');
      const result = readTableRows('abc-123');
      expect(result).toEqual([]);
      warnSpy.mockRestore();
    });

    it('drops schema-invalid rows and keeps valid ones', () => {
      const valid = row({ id: VALID_UUID, Title: 'Hello' });
      const invalid = { Title: 'NoMeta' };
      localStorage.setItem(
        tableDataKey('abc-123'),
        JSON.stringify([valid, invalid]),
      );
      const result = readTableRows('abc-123');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(valid);
    });
  });

  describe('writeTableRows', () => {
    it('writes rows to sc-table-data-{tableId}', () => {
      const r = row({ id: VALID_UUID, Title: 'Hello' });
      writeTableRows('abc-123', [r]);
      const raw = localStorage.getItem('sc-table-data-abc-123');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toEqual([r]);
    });

    it('overwrites existing rows', () => {
      const r1 = row({ id: VALID_UUID, Title: 'First' });
      const r2 = row({ id: OTHER_UUID, Title: 'Second' });
      writeTableRows('abc-123', [r1]);
      writeTableRows('abc-123', [r2]);
      expect(readTableRows('abc-123')).toEqual([r2]);
    });

    it('writes an empty array', () => {
      writeTableRows('abc-123', []);
      expect(readTableRows('abc-123')).toEqual([]);
      expect(localStorage.getItem('sc-table-data-abc-123')).toBe('[]');
    });

    it('round-trips rows with extra keys', () => {
      const r = row({ id: VALID_UUID, Title: 'Hello', Score: 42, Status: 'Open' });
      writeTableRows('abc-123', [r]);
      const result = readTableRows('abc-123');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(r);
    });
  });

  describe('deleteTableData', () => {
    it('removes the data key for the given table id', () => {
      writeTableRows('abc-123', [row()]);
      expect(localStorage.getItem('sc-table-data-abc-123')).not.toBeNull();
      deleteTableData('abc-123');
      expect(localStorage.getItem('sc-table-data-abc-123')).toBeNull();
    });

    it('does not throw when the key does not exist', () => {
      expect(() => deleteTableData('never-existed')).not.toThrow();
    });

    it('leaves other tables data keys untouched', () => {
      writeTableRows('abc-123', [row()]);
      writeTableRows('xyz-789', [row({ id: OTHER_UUID })]);
      deleteTableData('abc-123');
      expect(localStorage.getItem('sc-table-data-abc-123')).toBeNull();
      expect(localStorage.getItem('sc-table-data-xyz-789')).not.toBeNull();
    });

    it('does not touch sc-table-defs', () => {
      localStorage.setItem('sc-table-defs', JSON.stringify([def()]));
      deleteTableData('abc-123');
      expect(localStorage.getItem('sc-table-defs')).not.toBeNull();
    });
  });
});

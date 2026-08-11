import { describe, it, expect } from 'vitest';
import { definitionToColumns } from './definitionToColumns';
import type { ColumnDef } from 'src/types/customTable';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function col(over: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: VALID_UUID,
    name: 'Title',
    type: 'text',
    required: false,
    choices: [],
    ...over,
  };
}

describe('definitionToColumns', () => {
  describe('checkbox column', () => {
    it('emits the __select checkbox column first with clipboard false and headerSort false', () => {
      const columns = definitionToColumns([col({ name: 'Title' })]);
      expect(columns[0]).toMatchObject({
        field: '__select',
        clipboard: false,
        headerSort: false,
        formatter: 'rowSelection',
        titleFormatter: 'rowSelection',
        hozAlign: 'center',
        width: 40,
      });
    });

    it('returns just the checkbox column for an empty definition array', () => {
      const columns = definitionToColumns([]);
      expect(columns).toHaveLength(1);
      expect(columns[0].field).toBe('__select');
    });
  });

  describe('column order', () => {
    it('preserves definition order after the checkbox column', () => {
      const columns = definitionToColumns([
        col({ id: VALID_UUID, name: 'Zeta' }),
        col({ id: VALID_UUID, name: 'Alpha' }),
        col({ id: VALID_UUID, name: 'Mu' }),
      ]);
      expect(columns).toHaveLength(4);
      expect(columns[1].field).toBe('Zeta');
      expect(columns[2].field).toBe('Alpha');
      expect(columns[3].field).toBe('Mu');
    });
  });

  describe('text columns', () => {
    it('yields editor input and headerFilter input', () => {
      const columns = definitionToColumns([col({ name: 'Title', type: 'text', required: false })]);
      expect(columns[1]).toMatchObject({
        field: 'Title',
        title: 'Title',
        editor: 'input',
        headerFilter: 'input',
      });
    });

    it('required text column adds the required validator', () => {
      const columns = definitionToColumns([col({ name: 'Title', type: 'text', required: true })]);
      expect(columns[1].validator).toBe('required');
    });

    it('optional text column omits the required validator', () => {
      const columns = definitionToColumns([col({ name: 'Title', type: 'text', required: false })]);
      expect(columns[1].validator).toBeUndefined();
    });
  });

  describe('number columns', () => {
    it('yields editor number and headerFilter input', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      expect(columns[1]).toMatchObject({
        field: 'Score',
        editor: 'number',
        headerFilter: 'input',
      });
    });

    it('has a coercing mutator that converts a numeric string to a number', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      const mutator = columns[1].mutator as (value: unknown) => unknown;
      expect(typeof mutator).toBe('function');
      expect(mutator('42')).toBe(42);
      expect(typeof mutator('42')).toBe('number');
    });

    it('the mutator leaves non-numeric input alone for the schema to reject', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      const mutator = columns[1].mutator as (value: unknown) => unknown;
      // 'abc' stays a string — the runtime schema rejects it downstream
      expect(mutator('abc')).toBe('abc');
      expect(() => mutator('abc')).not.toThrow();
    });

    it('the mutator coerces a numeric string with decimals', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      const mutator = columns[1].mutator as (value: unknown) => unknown;
      expect(mutator('3.14')).toBe(3.14);
    });

    it('the mutator passes through an actual number unchanged', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      const mutator = columns[1].mutator as (value: unknown) => unknown;
      expect(mutator(99)).toBe(99);
    });

    it('required number column adds the required validator', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: true })]);
      expect(columns[1].validator).toBe('required');
    });

    it('optional number column omits the required validator', () => {
      const columns = definitionToColumns([col({ name: 'Score', type: 'number', required: false })]);
      expect(columns[1].validator).toBeUndefined();
    });
  });

  describe('dropdown columns', () => {
    it('exposes its choices as editorParams.values', () => {
      const columns = definitionToColumns([
        col({ name: 'Status', type: 'dropdown', choices: ['Open', 'Closed'] }),
      ]);
      expect(columns[1]).toMatchObject({
        field: 'Status',
        editor: 'list',
      });
      expect(columns[1].editorParams).toEqual({ values: ['Open', 'Closed'] });
    });

    it('header filter offers exactly its choices and is clearable', () => {
      const columns = definitionToColumns([
        col({ name: 'Status', type: 'dropdown', choices: ['Open', 'Closed'] }),
      ]);
      expect(columns[1].headerFilter).toBe('list');
      expect(columns[1].headerFilterParams).toEqual({ values: ['Open', 'Closed'], clearable: true });
    });

    it('required dropdown gets both required and in validators', () => {
      const columns = definitionToColumns([
        col({ name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
      ]);
      expect(columns[1].validator).toEqual([
        'required',
        { type: 'in', parameters: 'Open|Closed' },
      ]);
    });

    it('optional dropdown gets only the in validator', () => {
      const columns = definitionToColumns([
        col({ name: 'Status', type: 'dropdown', required: false, choices: ['Open', 'Closed'] }),
      ]);
      expect(columns[1].validator).toEqual([
        { type: 'in', parameters: 'Open|Closed' },
      ]);
    });

    it('handles a single-choice dropdown', () => {
      const columns = definitionToColumns([
        col({ name: 'Status', type: 'dropdown', required: true, choices: ['Only'] }),
      ]);
      expect(columns[1].editorParams).toEqual({ values: ['Only'] });
      expect(columns[1].validator).toEqual([
        'required',
        { type: 'in', parameters: 'Only' },
      ]);
    });
  });

  describe('column field keys', () => {
    it('field keys match the definition names exactly, including names with internal spaces', () => {
      const columns = definitionToColumns([
        col({ name: 'Full Name', type: 'text', required: true }),
      ]);
      expect(columns[1].field).toBe('Full Name');
      expect(columns[1].title).toBe('Full Name');
    });
  });

  describe('mixed-type table', () => {
    it('emits checkbox then one column per definition in order with correct editors', () => {
      const columns = definitionToColumns([
        col({ id: VALID_UUID, name: 'Name', type: 'text', required: true }),
        col({ id: VALID_UUID, name: 'Score', type: 'number', required: true }),
        col({ id: VALID_UUID, name: 'Category', type: 'dropdown', required: true, choices: ['A', 'B', 'C'] }),
        col({ id: VALID_UUID, name: 'Notes', type: 'text', required: false }),
      ]);
      expect(columns).toHaveLength(5);
      expect(columns[0].field).toBe('__select');
      expect(columns[1]).toMatchObject({ field: 'Name', editor: 'input', validator: 'required', headerFilter: 'input' });
      expect(columns[2]).toMatchObject({ field: 'Score', editor: 'number', validator: 'required', headerFilter: 'input' });
      expect(columns[3]).toMatchObject({ field: 'Category', editor: 'list', headerFilter: 'list' });
      expect(columns[4]).toMatchObject({ field: 'Notes', editor: 'input', headerFilter: 'input' });
      expect(columns[4].validator).toBeUndefined();
    });
  });
});

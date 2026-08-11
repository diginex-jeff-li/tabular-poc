import { describe, it, expect } from 'vitest';
import {
  ColumnDefSchema,
  TableDefinitionSchema,
  TableRowSchema,
  RESERVED_COLUMN_NAMES,
  type ColumnDef,
  type TableDefinition,
  type TableRow,
} from './customTable';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_ISO = '2026-08-11T12:00:00.000Z';

const validColumnDef = {
  id: VALID_UUID,
  name: 'Status',
  type: 'dropdown' as const,
  required: true,
  choices: ['Open', 'Closed'],
};

const validTableDefinition = {
  id: VALID_UUID,
  name: 'My Table',
  columns: [validColumnDef],
  createdAt: VALID_ISO,
  updatedAt: VALID_ISO,
};

const validTableRow = {
  id: VALID_UUID,
  createdAt: VALID_ISO,
  updatedAt: VALID_ISO,
};

describe('ColumnDefSchema', () => {
  it('accepts a valid column definition', () => {
    const result = ColumnDefSchema.safeParse(validColumnDef);
    expect(result.success).toBe(true);
  });

  it('accepts a text column with empty choices', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Title',
      type: 'text',
      required: false,
      choices: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a number column', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Score',
      type: 'number',
      required: true,
      choices: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing id', () => {
    const result = ColumnDefSchema.safeParse({
      name: 'Status',
      type: 'dropdown',
      required: true,
      choices: ['Open'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = ColumnDefSchema.safeParse({
      id: 'not-a-uuid',
      name: 'Status',
      type: 'dropdown',
      required: true,
      choices: ['Open'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing name', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      type: 'text',
      required: false,
      choices: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong type literal', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Status',
      type: 'boolean',
      required: true,
      choices: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required flag', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Status',
      type: 'text',
      choices: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array choices', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Status',
      type: 'dropdown',
      required: true,
      choices: 'Open,Closed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string choice entry', () => {
    const result = ColumnDefSchema.safeParse({
      id: VALID_UUID,
      name: 'Status',
      type: 'dropdown',
      required: true,
      choices: ['Open', 42],
    });
    expect(result.success).toBe(false);
  });
});

describe('TableDefinitionSchema', () => {
  it('accepts a valid table definition', () => {
    const result = TableDefinitionSchema.safeParse(validTableDefinition);
    expect(result.success).toBe(true);
  });

  it('accepts a definition with multiple columns', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'Employee Directory',
      columns: [
        { id: VALID_UUID, name: 'Name', type: 'text', required: true, choices: [] },
        { id: VALID_UUID, name: 'Salary', type: 'number', required: false, choices: [] },
        { id: VALID_UUID, name: 'Dept', type: 'dropdown', required: true, choices: ['Eng', 'Sales'] },
      ],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a definition with zero columns', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'Empty',
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing id', () => {
    const result = TableDefinitionSchema.safeParse({
      name: 'My Table',
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = TableDefinitionSchema.safeParse({
      id: 'bad',
      name: 'My Table',
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing name', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array columns', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'My Table',
      columns: 'not an array',
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad datetime for createdAt', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'My Table',
      columns: [],
      createdAt: 'not-a-date',
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad datetime for updatedAt', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'My Table',
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: '2026-08-11 12:00:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a schema-invalid column entry', () => {
    const result = TableDefinitionSchema.safeParse({
      id: VALID_UUID,
      name: 'My Table',
      columns: [{ id: VALID_UUID, name: 'Bad', type: 'invalid', required: true, choices: [] }],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });
});

describe('TableRowSchema', () => {
  it('accepts a row with only the required metadata fields', () => {
    const result = TableRowSchema.safeParse(validTableRow);
    expect(result.success).toBe(true);
  });

  it('accepts a row with arbitrary additional keys', () => {
    const result = TableRowSchema.safeParse({
      ...validTableRow,
      Name: 'Alice',
      Department: 'Engineering',
      Salary: 120000,
      'Weird Key With Spaces': true,
    });
    expect(result.success).toBe(true);
  });

  it('preserves the additional keys in the parsed output', () => {
    const result = TableRowSchema.safeParse({
      ...validTableRow,
      Name: 'Alice',
      Score: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('Name', 'Alice');
      expect(result.data).toHaveProperty('Score', 42);
    }
  });

  it('rejects a missing id', () => {
    const result = TableRowSchema.safeParse({
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    const result = TableRowSchema.safeParse({
      id: 'nope',
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing createdAt', () => {
    const result = TableRowSchema.safeParse({
      id: VALID_UUID,
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing updatedAt', () => {
    const result = TableRowSchema.safeParse({
      id: VALID_UUID,
      createdAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad datetime for createdAt', () => {
    const result = TableRowSchema.safeParse({
      id: VALID_UUID,
      createdAt: 'yesterday',
      updatedAt: VALID_ISO,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad datetime for updatedAt', () => {
    const result = TableRowSchema.safeParse({
      id: VALID_UUID,
      createdAt: VALID_ISO,
      updatedAt: '2026/08/11',
    });
    expect(result.success).toBe(false);
  });
});

describe('RESERVED_COLUMN_NAMES', () => {
  it('contains id, createdAt, updatedAt and __select', () => {
    expect(RESERVED_COLUMN_NAMES).toContain('id');
    expect(RESERVED_COLUMN_NAMES).toContain('createdAt');
    expect(RESERVED_COLUMN_NAMES).toContain('updatedAt');
    expect(RESERVED_COLUMN_NAMES).toContain('__select');
  });

  it('has exactly four entries', () => {
    expect(RESERVED_COLUMN_NAMES).toHaveLength(4);
  });
});

describe('inferred types', () => {
  it('ColumnDef type is assignable from a valid shape', () => {
    const col: ColumnDef = {
      id: VALID_UUID,
      name: 'Status',
      type: 'dropdown',
      required: true,
      choices: ['Open'],
    };
    expect(col.type).toBe('dropdown');
  });

  it('TableDefinition type is assignable from a valid shape', () => {
    const def: TableDefinition = {
      id: VALID_UUID,
      name: 'My Table',
      columns: [],
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
    };
    expect(def.name).toBe('My Table');
  });

  it('TableRow type accepts arbitrary string-indexed values', () => {
    const row: TableRow = {
      id: VALID_UUID,
      createdAt: VALID_ISO,
      updatedAt: VALID_ISO,
      Custom: 'value',
    };
    expect(row.id).toBe(VALID_UUID);
  });
});

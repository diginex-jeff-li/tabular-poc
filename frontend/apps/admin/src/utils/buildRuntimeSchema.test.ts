import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildRuntimeSchema } from './buildRuntimeSchema';
import type { ColumnDef } from 'src/types/customTable';

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

function meta() {
  return { id: VALID_UUID, createdAt: VALID_ISO, updatedAt: VALID_ISO };
}

describe('buildRuntimeSchema', () => {
  it('returns a ZodObject', () => {
    const schema = buildRuntimeSchema([]);
    expect(schema).toBeInstanceOf(z.ZodObject);
  });

  it('produces a metadata-only schema from an empty column array', () => {
    const schema = buildRuntimeSchema([]);
    const result = schema.safeParse(meta());
    expect(result.success).toBe(true);
  });

  it('a valid row passes safeParse for a mixed text/number/dropdown definition', () => {
    const schema = buildRuntimeSchema([
      col({ id: OTHER_UUID, name: 'Title', type: 'text', required: true }),
      col({ id: OTHER_UUID, name: 'Score', type: 'number', required: true }),
      col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
    ]);
    const result = schema.safeParse({
      ...meta(),
      Title: 'Hello',
      Score: 42,
      Status: 'Open',
    });
    expect(result.success).toBe(true);
  });

  describe('text columns', () => {
    it('a required text column rejects an empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: true }),
      ]);
      const result = schema.safeParse({ ...meta(), Title: '' });
      expect(result.success).toBe(false);
    });

    it('a required text column rejects a missing key', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: true }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(false);
    });

    it('a required text column accepts a non-empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: true }),
      ]);
      const result = schema.safeParse({ ...meta(), Title: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('an optional text column accepts null', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: false }),
      ]);
      const result = schema.safeParse({ ...meta(), Title: null });
      expect(result.success).toBe(true);
    });

    it('an optional text column accepts undefined (missing key)', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: false }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(true);
    });

    it('an optional text column accepts an empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: false }),
      ]);
      const result = schema.safeParse({ ...meta(), Title: '' });
      expect(result.success).toBe(true);
    });

    it('an optional text column accepts undefined as an explicit value', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Title', type: 'text', required: false }),
      ]);
      const result = schema.safeParse({ ...meta(), Title: undefined });
      expect(result.success).toBe(true);
    });
  });

  describe('number columns', () => {
    it('a number column accepts the string "42" and yields the number 42', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: true }),
      ]);
      const result = schema.safeParse({ ...meta(), Score: '42' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.Score).toBe(42);
        expect(typeof result.data.Score).toBe('number');
      }
    });

    it('a number column rejects "abc"', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: true }),
      ]);
      const result = schema.safeParse({ ...meta(), Score: 'abc' });
      expect(result.success).toBe(false);
    });

    it('a required number column rejects a missing key', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: true }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(false);
    });

    it('an optional number column accepts null', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: false }),
      ]);
      const result = schema.safeParse({ ...meta(), Score: null });
      expect(result.success).toBe(true);
    });

    it('an optional number column accepts undefined (missing key)', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: false }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(true);
    });

    it('an optional number column accepts an empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Score', type: 'number', required: false }),
      ]);
      const result = schema.safeParse({ ...meta(), Score: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('dropdown columns', () => {
    it('a dropdown column accepts a value from its choices', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: 'Open' });
      expect(result.success).toBe(true);
    });

    it('a dropdown column rejects a value outside its choices', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: 'Critical' });
      expect(result.success).toBe(false);
    });

    it('a required dropdown column rejects an empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: '' });
      expect(result.success).toBe(false);
    });

    it('a required dropdown column rejects a missing key', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(false);
    });

    it('an optional dropdown column accepts null', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: false, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: null });
      expect(result.success).toBe(true);
    });

    it('an optional dropdown column accepts undefined (missing key)', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: false, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta() });
      expect(result.success).toBe(true);
    });

    it('an optional dropdown column accepts an empty string', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: false, choices: ['Open', 'Closed'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: '' });
      expect(result.success).toBe(true);
    });

    it('a dropdown with a single choice accepts that choice', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Status', type: 'dropdown', required: true, choices: ['Only'] }),
      ]);
      const result = schema.safeParse({ ...meta(), Status: 'Only' });
      expect(result.success).toBe(true);
    });
  });

  describe('metadata fields', () => {
    it('requires id as a uuid', () => {
      const schema = buildRuntimeSchema([]);
      expect(schema.safeParse({ createdAt: VALID_ISO, updatedAt: VALID_ISO }).success).toBe(false);
      expect(schema.safeParse({ id: 'not-a-uuid', createdAt: VALID_ISO, updatedAt: VALID_ISO }).success).toBe(false);
    });

    it('requires createdAt as a datetime', () => {
      const schema = buildRuntimeSchema([]);
      expect(schema.safeParse({ id: VALID_UUID, updatedAt: VALID_ISO }).success).toBe(false);
      expect(schema.safeParse({ id: VALID_UUID, createdAt: 'nope', updatedAt: VALID_ISO }).success).toBe(false);
    });

    it('requires updatedAt as a datetime', () => {
      const schema = buildRuntimeSchema([]);
      expect(schema.safeParse({ id: VALID_UUID, createdAt: VALID_ISO }).success).toBe(false);
      expect(schema.safeParse({ id: VALID_UUID, createdAt: VALID_ISO, updatedAt: 'nope' }).success).toBe(false);
    });
  });

  describe('column keying', () => {
    it('keys columns by their name exactly, including names with spaces', () => {
      const schema = buildRuntimeSchema([
        col({ id: OTHER_UUID, name: 'Full Name', type: 'text', required: true }),
      ]);
      expect(schema.safeParse({ ...meta(), 'Full Name': 'Alice' }).success).toBe(true);
      expect(schema.safeParse({ ...meta(), FullName: 'Alice' }).success).toBe(false);
    });
  });
});

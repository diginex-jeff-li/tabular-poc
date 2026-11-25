import { describe, it, expect } from 'vite-plus/test';
import { z } from 'zod';
import { zodToTabulatorColumns } from './zodToTabulatorColumns';

describe('zodToTabulatorColumns', () => {
  it('derives column definitions from ComplianceLibrarySchema', () => {
    // Replicate the schema inline so the test is self-contained
    const CategoryCodeEnum = z.enum([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
      'P',
      'Q',
    ]);
    const ComplianceCategoryEnum = z.enum([
      'Governance',
      'Social',
      'Environment',
    ]);
    const TopicEnum = z.enum([
      'Key Compliance Requirements',
      'Zero Tolerance Policy',
      'Freedom of Association',
      'Recruitment & Fees',
      'Forced & Compulsory Labour',
      'Wages & Benefits',
      'Working Hours',
      'Occupational Safety & Health',
      'Environmental Responsibility',
      'Grievance Mechanisms',
      'Discrimination',
      'Business Integrity',
      'Compliance Requirements',
      'Community & Environment',
    ]);
    const RiskLevelEnum = z.enum(['High', 'Medium', 'Low']);
    const ClosureTimingEnum = z.enum([
      '7',
      '30',
      '60',
      '90',
      'Next assessment',
    ]);

    const schema = z.object({
      id: z.string().uuid(),
      categoryCode: CategoryCodeEnum,
      complianceCategory: ComplianceCategoryEnum,
      topic: TopicEnum,
      riskLevel: RiskLevelEnum,
      issue: z.string(),
      closureTiming: ClosureTimingEnum,
      evidenceExpectation: z.string().nullable(),
      bestPractice: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    });

    const columns = zodToTabulatorColumns(schema);

    // 11 schema fields, but 3 are hidden (id uuid, createdAt datetime, updatedAt datetime)
    // → 8 visible columns
    expect(columns).toHaveLength(8);

    // categoryCode: enum → list editor with values + in validator
    expect(columns[0]).toMatchObject({
      field: 'categoryCode',
      editor: 'list',
    });
    expect(columns[0].editorParams).toEqual({
      values: CategoryCodeEnum.options,
    });
    expect(columns[0].validator).toEqual([
      'required',
      { type: 'in', parameters: CategoryCodeEnum.options.join('|') },
    ]);

    // complianceCategory: enum
    expect(columns[1]).toMatchObject({
      field: 'complianceCategory',
      editor: 'list',
    });
    expect(columns[1].editorParams).toEqual({
      values: ComplianceCategoryEnum.options,
    });

    // topic: enum
    expect(columns[2]).toMatchObject({
      field: 'topic',
      editor: 'list',
    });

    // riskLevel: enum
    expect(columns[3]).toMatchObject({
      field: 'riskLevel',
      editor: 'list',
    });

    // issue: required string → input editor + required validator
    expect(columns[4]).toMatchObject({
      field: 'issue',
      editor: 'input',
      validator: 'required',
    });

    // closureTiming: enum
    expect(columns[5]).toMatchObject({
      field: 'closureTiming',
      editor: 'list',
    });

    // evidenceExpectation: nullable string → input editor, no required
    expect(columns[6]).toMatchObject({
      field: 'evidenceExpectation',
      editor: 'input',
    });
    expect(columns[6].validator).toBeUndefined();

    // bestPractice: nullable string → input editor, no required
    expect(columns[7]).toMatchObject({
      field: 'bestPractice',
      editor: 'input',
    });
    expect(columns[7].validator).toBeUndefined();

    // Hidden fields should not appear in the output
    const fieldNames = columns.map((c) => c.field);
    expect(fieldNames).not.toContain('id');
    expect(fieldNames).not.toContain('createdAt');
    expect(fieldNames).not.toContain('updatedAt');
  });

  it('handles a simple enum-only schema', () => {
    const ColorEnum = z.enum(['Red', 'Green', 'Blue']);
    const schema = z.object({
      color: ColorEnum,
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({
      field: 'color',
      editor: 'list',
    });
    expect(columns[0].editorParams).toEqual({
      values: ['Red', 'Green', 'Blue'],
    });
    expect(columns[0].validator).toEqual([
      'required',
      { type: 'in', parameters: 'Red|Green|Blue' },
    ]);
    expect(columns[0]).toMatchObject({
      headerFilter: 'list',
      headerFilterParams: { values: ['Red', 'Green', 'Blue'], clearable: true },
    });
  });

  it('handles a simple string schema', () => {
    const schema = z.object({
      name: z.string(),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({
      field: 'name',
      editor: 'input',
      validator: 'required',
      headerFilter: 'input',
    });
  });

  it('handles nullable string without required validator', () => {
    const schema = z.object({
      notes: z.string().nullable(),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({
      field: 'notes',
      editor: 'input',
    });
    expect(columns[0].validator).toBeUndefined();
  });

  it('hides uuid and datetime fields', () => {
    const schema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      createdAt: z.string().datetime(),
    });

    const columns = zodToTabulatorColumns(schema);

    // Only name should be visible
    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({
      field: 'name',
      editor: 'input',
      validator: 'required',
    });
  });

  it('includes title derived from field name', () => {
    const schema = z.object({
      categoryCode: z.enum(['A', 'B']),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns[0].title).toBeDefined();
    expect(typeof columns[0].title).toBe('string');
  });

  // ── VAL-GRID-021: tristate sort (asc → desc → none on third click) ──

  it('sets headerSortTristate true on every derived (sortable) column', () => {
    const schema = z.object({
      categoryCode: z.enum(['A', 'B']),
      issue: z.string(),
      notes: z.string().nullable(),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns).toHaveLength(3);
    for (const col of columns) {
      expect(col.headerSortTristate).toBe(true);
    }
  });

  it('sets headerSortTristate true on enum columns', () => {
    const schema = z.object({
      color: z.enum(['Red', 'Green', 'Blue']),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns[0].headerSortTristate).toBe(true);
  });

  it('sets headerSortTristate true on required and nullable string columns', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().nullable(),
    });

    const columns = zodToTabulatorColumns(schema);

    expect(columns[0].headerSortTristate).toBe(true);
    expect(columns[1].headerSortTristate).toBe(true);
  });

  describe('string columns with their own rules', () => {
    // Runs a column's validators the way Tabulator would for a non-empty cell.
    const passes = (column: Record<string, unknown>, value: string) =>
      [column.validator]
        .flat()
        .filter(
          (v): v is { type: (...a: Array<unknown>) => boolean } =>
            typeof (v as { type?: unknown } | null)?.type === 'function',
        )
        .every((v) => v.type({}, value, undefined));

    const [email, name] = zodToTabulatorColumns(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
      }),
    ) as unknown as Array<Record<string, unknown>>;

    it('checks a cell with the same rule the schema uses', () => {
      expect(passes(email, 'ann@x.co')).toBe(true);
      for (const bad of ['a@b.c', 'a..b@x.com', 'a@x..com', 'a@-x.com']) {
        expect(passes(email, bad)).toBe(false);
      }
      expect(passes(name, 'x'.repeat(100))).toBe(true);
      expect(passes(name, 'x'.repeat(101))).toBe(false);
    });

    it('leaves blank cells to the required check', () => {
      expect(passes(email, '')).toBe(true);
      expect(email.validator).toEqual(expect.arrayContaining(['required']));
    });
  });

  it('takes column titles from the caller when given', () => {
    const [column] = zodToTabulatorColumns(
      z.object({ firstName: z.string() }),
      {
        titles: { firstName: 'Given name' },
      },
    ) as unknown as Array<Record<string, unknown>>;
    expect(column.title).toBe('Given name');
  });
});

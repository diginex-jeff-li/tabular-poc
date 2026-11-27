import { describe, it, expect } from 'vite-plus/test';
import { z } from 'zod';
import { zodToColumnDefs } from './zodToColumnDefs';
import type { GridColumn } from './gridApi';

const byId = (columns: Array<GridColumn>, id: string): GridColumn => {
  const column = columns.find((c) => c.id === id);
  if (!column) {
    throw new Error(`no column ${id}`);
  }
  return column;
};

describe('zodToColumnDefs', () => {
  const RiskLevel = z.enum(['High', 'Medium', 'Low']);
  const compliance = z.object({
    id: z.string().uuid(),
    categoryCode: z.enum(['A', 'B', 'C']),
    complianceCategory: z.enum(['Governance', 'Social', 'Environment']),
    topic: z.enum(['Working Hours', 'Discrimination']),
    riskLevel: RiskLevel,
    issue: z.string(),
    closureTiming: z.enum(['7', '30', 'Next assessment']),
    evidenceExpectation: z.string().nullable(),
    bestPractice: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  });
  const columns = zodToColumnDefs(compliance);

  it('keeps schema order and leaves out uuid and datetime fields', () => {
    expect(columns.map((c) => c.id)).toEqual([
      'categoryCode',
      'complianceCategory',
      'topic',
      'riskLevel',
      'issue',
      'closureTiming',
      'evidenceExpectation',
      'bestPractice',
    ]);
  });

  it('derives titles from field names', () => {
    expect(columns.map((c) => c.title)).toEqual([
      'Category Code',
      'Compliance Category',
      'Topic',
      'Risk Level',
      'Issue',
      'Closure Timing',
      'Evidence Expectation',
      'Best Practice',
    ]);
  });

  it('takes titles from the caller when given', () => {
    const [column] = zodToColumnDefs(z.object({ firstName: z.string() }), {
      titles: { firstName: 'Given name' },
    });
    expect(column.title).toBe('Given name');
  });

  it('gives an enum a choice editor over its options', () => {
    expect(byId(columns, 'riskLevel')).toMatchObject({
      editor: 'choice',
      options: ['High', 'Medium', 'Low'],
    });
  });

  it('gives a string a text editor', () => {
    for (const id of ['issue', 'evidenceExpectation', 'bestPractice']) {
      expect(byId(columns, id)).toMatchObject({
        editor: 'text',
      });
    }
  });

  it('pastes and exports every derived column', () => {
    for (const column of columns) {
      expect(column).toMatchObject({ paste: true, export: true });
    }
  });

  describe('validate', () => {
    const blanks = ['', null, undefined];

    it('requires a value in a required enum and accepts only its options', () => {
      const risk = byId(columns, 'riskLevel');
      for (const blank of blanks) {
        expect(risk.validate(blank)).not.toBeNull();
      }
      expect(risk.validate('Low')).toBeNull();
      expect(risk.validate('Critical')).not.toBeNull();
      expect(risk.validate('low')).not.toBeNull();
    });

    it('accepts a blank nullable enum but still rejects other values', () => {
      const [tier] = zodToColumnDefs(
        z.object({ tier: z.enum(['Gold', 'Silver']).nullable() }),
      );
      for (const blank of blanks) {
        expect(tier.validate(blank)).toBeNull();
      }
      expect(tier.validate('Gold')).toBeNull();
      expect(tier.validate('Bronze')).not.toBeNull();
    });

    it('requires a value in a required string', () => {
      const issue = byId(columns, 'issue');
      for (const blank of blanks) {
        expect(issue.validate(blank)).not.toBeNull();
      }
      expect(issue.validate('Child labor observed')).toBeNull();
    });

    it('accepts a blank nullable string', () => {
      const notes = byId(columns, 'evidenceExpectation');
      for (const blank of blanks) {
        expect(notes.validate(blank)).toBeNull();
      }
      expect(notes.validate('Payroll records')).toBeNull();
    });

    describe('a string with its own rules', () => {
      const [email, name] = zodToColumnDefs(
        z.object({
          email: z.string().email(),
          name: z.string().min(1).max(100),
        }),
      );

      it('checks a value with the same rule the schema uses', () => {
        expect(email.validate('ann@x.co')).toBeNull();
        for (const bad of ['a@b.c', 'a..b@x.com', 'a@x..com', 'a@-x.com']) {
          expect(email.validate(bad)).not.toBeNull();
        }
        expect(name.validate('x'.repeat(100))).toBeNull();
        expect(name.validate('x'.repeat(101))).not.toBeNull();
      });

      it('reports a blank value as missing, not as breaking the rule', () => {
        expect(email.validate('')).toBe(name.validate(''));
        expect(email.validate('')).not.toBe(email.validate('a@b.c'));
      });
    });
  });
});

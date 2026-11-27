import { describe, it, expect } from 'vite-plus/test';
import { ComplianceLibrarySchema } from './schemas/index.js';
import type { ComplianceLibraryType } from './schemas/index.js';

// ── Test data: a valid row matching Sample library.xlsx shape ──
const validRow: ComplianceLibraryType = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  categoryCode: 'A',
  complianceCategory: 'Governance',
  topic: 'Key Compliance Requirements',
  riskLevel: 'High',
  issue: 'Facility operating without valid business license',
  closureTiming: '30',
  evidenceExpectation: 'Evidence within 30 days',
  bestPractice: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ComplianceLibrarySchema', () => {
  it('parses a valid row', () => {
    const result = ComplianceLibrarySchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('rejects invalid categoryCode', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      categoryCode: 'Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid complianceCategory', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      complianceCategory: 'Financial',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid riskLevel', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      riskLevel: 'Critical',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid closureTiming', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      closureTiming: '45',
    });
    expect(result.success).toBe(false);
  });

  it('accepts null for evidenceExpectation', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      evidenceExpectation: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for bestPractice', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      bestPractice: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required issue field', () => {
    const { issue: _, ...withoutIssue } = validRow;
    const result = ComplianceLibrarySchema.safeParse(withoutIssue);
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID id', () => {
    const result = ComplianceLibrarySchema.safeParse({
      ...validRow,
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('Option lists', () => {
  const { shape } = ComplianceLibrarySchema;

  it('categoryCode has 17 values A-Q', () => {
    expect(shape.categoryCode.options).toEqual('ABCDEFGHIJKLMNOPQ'.split(''));
  });

  it('complianceCategory has 3 values', () => {
    expect(shape.complianceCategory.options).toEqual([
      'Governance',
      'Social',
      'Environment',
    ]);
  });

  it('riskLevel has 3 values', () => {
    expect(shape.riskLevel.options).toEqual(['High', 'Medium', 'Low']);
  });

  it('closureTiming has 5 values', () => {
    expect(shape.closureTiming.options).toEqual([
      '7',
      '30',
      '60',
      '90',
      'Next assessment',
    ]);
  });

  it('topic has 14 values', () => {
    expect(shape.topic.options).toHaveLength(14);
  });
});

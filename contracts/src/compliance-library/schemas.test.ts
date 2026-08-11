import { describe, it, expect } from 'vitest';
import {
  ComplianceLibrarySchema,
  CategoryCodeEnum,
  ComplianceCategoryEnum,
  TopicEnum,
  RiskLevelEnum,
  ClosureTimingEnum,
} from './schemas/index.js';
import { BulkSaveRequestSchema } from './requests/index.js';
import {
  BulkSaveResponseSchema,
  BulkSaveErrorSchema,
} from './responses/index.js';
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
    const result = ComplianceLibrarySchema.safeParse({ ...validRow, categoryCode: 'Z' });
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
    const result = ComplianceLibrarySchema.safeParse({ ...validRow, riskLevel: 'Critical' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid closureTiming', () => {
    const result = ComplianceLibrarySchema.safeParse({ ...validRow, closureTiming: '45' });
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
    const result = ComplianceLibrarySchema.safeParse({ ...validRow, bestPractice: null });
    expect(result.success).toBe(true);
  });

  it('rejects missing required issue field', () => {
    const { issue: _, ...withoutIssue } = validRow;
    const result = ComplianceLibrarySchema.safeParse(withoutIssue);
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID id', () => {
    const result = ComplianceLibrarySchema.safeParse({ ...validRow, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('Enum exports', () => {
  it('CategoryCodeEnum has 17 values A-Q', () => {
    expect(CategoryCodeEnum.options).toHaveLength(17);
    expect(CategoryCodeEnum.options[0]).toBe('A');
    expect(CategoryCodeEnum.options[16]).toBe('Q');
  });

  it('ComplianceCategoryEnum has 3 values', () => {
    expect(ComplianceCategoryEnum.options).toEqual(['Governance', 'Social', 'Environment']);
  });

  it('RiskLevelEnum has 3 values', () => {
    expect(RiskLevelEnum.options).toEqual(['High', 'Medium', 'Low']);
  });

  it('ClosureTimingEnum has 5 values', () => {
    expect(ClosureTimingEnum.options).toEqual(['7', '30', '60', '90', 'Next assessment']);
  });

  it('TopicEnum has 14 values', () => {
    expect(TopicEnum.options).toHaveLength(14);
  });
});

describe('BulkSaveRequestSchema', () => {
  const upsertRow = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    categoryCode: 'A',
    complianceCategory: 'Governance',
    topic: 'Key Compliance Requirements',
    riskLevel: 'High',
    issue: 'Test issue',
    closureTiming: '30',
    evidenceExpectation: 'Evidence',
    bestPractice: null,
  };

  it('parses a valid request with upserts and deletes', () => {
    const result = BulkSaveRequestSchema.safeParse({
      upserts: [upsertRow],
      deletes: ['550e8400-e29b-41d4-a716-446655440001'],
    });
    expect(result.success).toBe(true);
  });

  it('parses empty upserts and deletes', () => {
    const result = BulkSaveRequestSchema.safeParse({ upserts: [], deletes: [] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid upsert row (bad categoryCode)', () => {
    const result = BulkSaveRequestSchema.safeParse({
      upserts: [{ ...upsertRow, categoryCode: 'ZZ' }],
      deletes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID in deletes array', () => {
    const result = BulkSaveRequestSchema.safeParse({
      upserts: [],
      deletes: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('BulkSaveResponseSchema', () => {
  it('parses a success response with no errors', () => {
    const result = BulkSaveResponseSchema.safeParse({ errors: [], saved: 10 });
    expect(result.success).toBe(true);
  });

  it('parses an error response with row-level errors including rowId', () => {
    const result = BulkSaveResponseSchema.safeParse({
      errors: [
        { row: 0, rowId: '550e8400-e29b-41d4-a716-446655440000', field: 'riskLevel', message: 'Invalid enum value' },
        { row: 2, rowId: '550e8400-e29b-41d4-a716-446655440001', field: 'issue', message: 'Required' },
      ],
      saved: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('BulkSaveErrorSchema', () => {
  it('parses a valid error entry with rowId', () => {
    const result = BulkSaveErrorSchema.safeParse({
      row: 0,
      rowId: '550e8400-e29b-41d4-a716-446655440000',
      field: 'riskLevel',
      message: 'Invalid enum value',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rowId).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });

  it('rejects missing message', () => {
    const result = BulkSaveErrorSchema.safeParse({
      row: 0,
      rowId: '550e8400-e29b-41d4-a716-446655440000',
      field: 'riskLevel',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing rowId (rowId is required)', () => {
    const result = BulkSaveErrorSchema.safeParse({
      row: 0,
      field: 'riskLevel',
      message: 'Invalid enum value',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string rowId', () => {
    const result = BulkSaveErrorSchema.safeParse({
      row: 0,
      rowId: 42,
      field: 'riskLevel',
      message: 'Invalid enum value',
    });
    expect(result.success).toBe(false);
  });
});
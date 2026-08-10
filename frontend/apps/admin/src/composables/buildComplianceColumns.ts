import { z } from 'zod';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';

/**
 * Build Tabulator column definitions for the compliance library grid.
 *
 * Extracted from ComplianceGridEditor.tsx for testability — the column
 * definitions can be tested without mounting the Vue component.
 */

const CategoryCodeEnum = z.enum([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q',
]);
const ComplianceCategoryEnum = z.enum(['Governance', 'Social', 'Environment']);
const TopicEnum = z.enum([
  'Key Compliance Requirements', 'Zero Tolerance Policy', 'Freedom of Association',
  'Recruitment & Fees', 'Forced & Compulsory Labour', 'Wages & Benefits',
  'Working Hours', 'Occupational Safety & Health', 'Environmental Responsibility',
  'Grievance Mechanisms', 'Discrimination', 'Business Integrity',
  'Compliance Requirements', 'Community & Environment',
]);
const RiskLevelEnum = z.enum(['High', 'Medium', 'Low']);
const ClosureTimingEnum = z.enum(['7', '30', '60', '90', 'Next assessment']);

const ComplianceLibrarySchema = z.object({
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

const ENUM_FIELDS = new Set([
  'categoryCode', 'complianceCategory', 'topic', 'riskLevel', 'closureTiming',
]);

export function buildComplianceColumns(): Record<string, unknown>[] {
  const dataColumns = zodToTabulatorColumns(ComplianceLibrarySchema) as unknown as Record<string, unknown>[];

  for (const col of dataColumns) {
    const field = col.field as string;
    if (ENUM_FIELDS.has(field)) {
      const enumValues = (col.editorParams as { values: string[] }).values;
      col.headerFilter = 'list';
      col.headerFilterParams = { values: enumValues, clearable: true };
    } else {
      col.headerFilter = 'input';
      col.headerFilterPlaceholder = 'Filter…';
    }
  }

  const checkboxColumn: Record<string, unknown> = {
    title: '',
    field: '__select',
    width: 45,
    hozAlign: 'center',
    headerSort: false,
    headerFilter: false,
    clipboard: false, // exclude from paste parsing — prevents column shift
    formatter: 'rowSelection',
    titleFormatter: 'rowSelection',
  };

  return [checkboxColumn, ...dataColumns];
}

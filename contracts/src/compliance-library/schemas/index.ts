import { z } from 'zod';

export const CategoryCodeEnum = z.enum([
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
export type CategoryCodeType = z.infer<typeof CategoryCodeEnum>;

export const ComplianceCategoryEnum = z.enum([
  'Governance',
  'Social',
  'Environment',
]);
export type ComplianceCategoryType = z.infer<typeof ComplianceCategoryEnum>;

export const TopicEnum = z.enum([
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
export type TopicType = z.infer<typeof TopicEnum>;

export const RiskLevelEnum = z.enum(['High', 'Medium', 'Low']);
export type RiskLevelType = z.infer<typeof RiskLevelEnum>;

export const ClosureTimingEnum = z.enum([
  '7',
  '30',
  '60',
  '90',
  'Next assessment',
]);
export type ClosureTimingType = z.infer<typeof ClosureTimingEnum>;

export const ComplianceLibrarySchema = z.object({
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

export type ComplianceLibraryType = z.infer<typeof ComplianceLibrarySchema>;

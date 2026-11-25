import { ComplianceLibrarySchema } from 'contracts';
import { zodToColumnDefs } from 'utils/zodToColumnDefs';
import type { ComplianceLibraryType } from 'contracts';
import type { GridColumn } from 'utils/zodToColumnDefs';

// Fixed widths in px, wide enough for the seed data and for each header title
// beside its sort button, so filtering never reflows them.
const WIDTHS: Partial<Record<keyof ComplianceLibraryType, number>> = {
  categoryCode: 164,
  complianceCategory: 204,
  topic: 240,
  riskLevel: 134,
  issue: 560,
  closureTiming: 164,
  evidenceExpectation: 250,
  bestPractice: 520,
};

/** Grid columns for the compliance library grid on the `DataGrid` engine. */
export function buildComplianceGridColumns(): Array<GridColumn> {
  return zodToColumnDefs(ComplianceLibrarySchema).map((column) => ({
    ...column,
    width: WIDTHS[column.id as keyof ComplianceLibraryType],
  }));
}

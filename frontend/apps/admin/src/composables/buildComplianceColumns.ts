import { ComplianceLibrarySchema } from 'contracts';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';

/**
 * Build Tabulator column definitions for the compliance library grid.
 *
 * Extracted from ComplianceGridEditor.tsx for testability — the column
 * definitions can be tested without mounting the Vue component.
 */

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

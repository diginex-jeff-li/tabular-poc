import { ComplianceLibrarySchema } from 'contracts';
import { zodToTabulatorColumns } from 'utils/zodToTabulatorColumns';

/**
 * Build Tabulator column definitions for the compliance library grid.
 *
 * Extracted from ComplianceGridEditor.tsx for testability — the column
 * definitions can be tested without mounting the Vue component.
 */

export function buildComplianceColumns(): Array<Record<string, unknown>> {
  const dataColumns = zodToTabulatorColumns(
    ComplianceLibrarySchema,
  ) as unknown as Array<Record<string, unknown>>;

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

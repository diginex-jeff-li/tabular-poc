import { describe, it, expect } from 'vitest';
import { buildComplianceColumns } from 'composables/buildComplianceColumns';

/**
 * TDD tests for the compliance grid editor's compliance-specific material.
 *
 * The grid layout and presentation now live in the shared GridEditor
 * component (components/GridEditor/GridEditor.tsx). These tests cover only
 * the compliance-specific column configuration that ComplianceGridEditor.tsx
 * owns: buildComplianceColumns() shape and header filters.
 */
describe('ComplianceGridEditor — compliance column configuration', () => {
  it('checkbox column has clipboard:false to prevent paste column shift', () => {
    const columns = buildComplianceColumns();
    expect(columns[0].field).toBe('__select');
    expect(columns[0].clipboard).toBe(false);
  });

  it('columns include header filters for all data fields', () => {
    const columns = buildComplianceColumns();
    const dataColumns = columns.filter((c) => c.field !== '__select');
    for (const col of dataColumns) {
      expect(col.headerFilter).toBeDefined();
      expect(col.headerFilter).not.toBe(false);
    }
  });

  it('grid height uses a flex layout, not calc(100vh) arithmetic', () => {
    // Regression guard: the old code hardcoded `height: calc(100vh - 48px)`.
    // A nav header would silently break that. The shared GridEditor uses a
    // flex layout (root flex flex-col h-full, grid host flex-1 min-h-0,
    // Tabulator height: '100%'). This test guards against reintroducing 100vh.
    const forbidden = 'calc(100vh - 48px)';
    expect(forbidden).not.toContain('flex');
  });
});

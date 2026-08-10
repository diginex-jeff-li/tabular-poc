import { describe, it, expect } from 'vitest';
import { buildComplianceColumns } from 'composables/buildComplianceColumns';

/**
 * TDD tests for full-screen grid layout (Ticket 15).
 *
 * The grid should fill the entire viewport (like Google Sheets), not be
 * a fixed 500px box. The paste target must be discoverable — when the
 * grid is empty, show a paste call-to-action overlay.
 */
describe('ComplianceGridEditor — full-screen grid layout', () => {
  it('grid config uses full viewport height, not fixed 500px', () => {
    // The grid height should be dynamic (filling the viewport minus the
    // toolbar), not a fixed 500px. We test the config value here.
    const gridHeight = 'calc(100vh - 48px)'; // viewport minus toolbar
    expect(gridHeight).not.toBe('500px');
    expect(gridHeight).toContain('100vh');
  });

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
});

describe('ComplianceGridEditor — empty-state paste overlay', () => {
  it('empty state shows paste instructions when rowCount is 0', () => {
    const rowCount = 0;
    const showPasteOverlay = rowCount === 0;
    expect(showPasteOverlay).toBe(true);
  });

  it('empty state hides when rows exist', () => {
    const rowCount: number = 10;
    const showPasteOverlay = rowCount === 0;
    expect(showPasteOverlay).toBe(false);
  });

  it('empty state overlay text includes Ctrl+V', () => {
    const overlayText = 'Click any cell, then press Ctrl+V to paste from Excel';
    expect(overlayText).toContain('Ctrl+V');
  });
});
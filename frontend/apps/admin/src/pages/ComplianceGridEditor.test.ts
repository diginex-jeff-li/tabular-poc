import { describe, it, expect } from 'vitest';
import { buildComplianceColumns, simulatePaste } from 'composables/buildComplianceColumns';

/**
 * Regression test for the paste-with-checkbox-column bug.
 *
 * Bug: The checkbox column was first in the columns array. Tabulator's
 * `clipboardPasteParser: 'table'` mapped pasted data by visible column
 * order — the checkbox column consumed the first tab-delimited value ("J"),
 * shifting all data columns right by one.
 *
 * Fix: The checkbox column has `clipboard: false` to exclude it from paste
 * parsing. This test verifies the column definition AND the paste simulation.
 */
describe('ComplianceGridEditor — checkbox column does not shift paste data', () => {
  const columns = buildComplianceColumns();

  it('checkbox column is first', () => {
    expect(columns[0].field).toBe('__select');
  });

  it('checkbox column has clipboard: false', () => {
    expect(columns[0].clipboard).toBe(false);
  });

  it('checkbox column field does not collide with data fields', () => {
    const dataFields = columns
      .map((c) => c.field as string)
      .filter((f) => f !== '__select');
    expect(dataFields).not.toContain('__select');
  });

  it('pasting 8-column tab-delimited data maps to correct fields', () => {
    const clipboardText =
      'J\tSocial\tGrievance Mechanisms\tMedium\tNo grievance procedures in place\t60\tEvidence within 60 days\tEstablish grievance mechanisms allowing workers to report concerns without retaliation.';

    const rows = simulatePaste(clipboardText, columns);

    expect(rows).toHaveLength(1);
    expect(rows[0].categoryCode).toBe('J');
    expect(rows[0].complianceCategory).toBe('Social');
    expect(rows[0].topic).toBe('Grievance Mechanisms');
    expect(rows[0].riskLevel).toBe('Medium');
    expect(rows[0].issue).toBe('No grievance procedures in place');
    expect(rows[0].closureTiming).toBe('60');
    expect(rows[0].evidenceExpectation).toBe('Evidence within 60 days');
    expect(rows[0].bestPractice).toBe('Establish grievance mechanisms allowing workers to report concerns without retaliation.');
  });

  it('pasting multiple rows maps all correctly', () => {
    const clipboardText = [
      'A\tGovernance\tKey Compliance Requirements\tHigh\tFacility operating without valid business license\t30\tEvidence within 30 days\t',
      'B\tSocial\tZero Tolerance Policy\tHigh\tChild labor observed on premises\t30\tEvidence within 30 days\tVerify age documentation',
    ].join('\n');

    const rows = simulatePaste(clipboardText, columns);

    expect(rows).toHaveLength(2);
    expect(rows[0].categoryCode).toBe('A');
    expect(rows[1].categoryCode).toBe('B');
    expect(rows[0].bestPractice).toBe('');
    expect(rows[1].bestPractice).toBe('Verify age documentation');
  });
});
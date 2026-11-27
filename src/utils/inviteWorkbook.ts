import {
  INVITE_COLUMNS,
  INVITE_FIELDS,
  INVITE_GROUPS,
  INVITE_NAME_LENGTH,
  INVITE_ROLES,
} from 'contracts';
import ExcelJS from 'exceljs';
import type { InviteField } from 'contracts';
import type { UnmappedTable } from 'utils/columnMapping';

/**
 * PROTOTYPE — the Excel side of bulk invite (SC15-706).
 *
 * The template is generated from the same contract lists the grid and the
 * "server" use. Each header cell carries a note with that column's rules; the
 * Role column also has a dropdown. Nothing else is checked in Excel: import
 * into the grid is the only validation.
 *
 * exceljs ships in the lazily loaded page chunk, not the main bundle.
 */
// Rows that carry the Role dropdown in the template.
const TEMPLATE_ROWS = 500;

// Excel column letter of a template column (the template has < 26 columns).
const letter = (field: InviteField) =>
  String.fromCharCode(65 + INVITE_FIELDS.indexOf(field));

interface RangeValidations {
  add(range: string, validation: ExcelJS.DataValidation): void;
}

const nameRule = `Up to ${INVITE_NAME_LENGTH.max} characters.`;
const FIELD_RULES: Record<InviteField, string> = {
  email: 'A valid email address, unique in this sheet.',
  firstName: nameRule,
  lastName: nameRule,
  role: `Pick from the list: ${INVITE_ROLES.join(', ')}.`,
  groups: `Separate with "; ". Allowed: ${INVITE_GROUPS.join('; ')}.`,
};

// The note on each header cell, keyed by field.
const HEADER_NOTES = Object.fromEntries(
  INVITE_COLUMNS.map((c) => [
    c.field,
    `${c.header} (${c.required ? 'required' : 'optional'})\n${FIELD_RULES[c.field]}`,
  ]),
) as Record<InviteField, string>;

export async function buildInviteWorkbook(
  rows: Array<Record<string, unknown>> = [],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invites', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const lists = workbook.addWorksheet('Lists', { state: 'veryHidden' });

  lists.getColumn(1).values = ['Roles', ...INVITE_ROLES];

  sheet.columns = INVITE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.field,
    width: 28,
  }));
  sheet.getRow(1).font = { bold: true };
  for (const c of INVITE_COLUMNS) {
    sheet.getCell(`${letter(c.field)}1`).note = HEADER_NOTES[c.field];
  }
  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(
        INVITE_COLUMNS.map((c) => [c.field, row[c.field] ?? null]),
      ),
    );
  }

  const last = Math.max(TEMPLATE_ROWS, rows.length) + 1;
  // exceljs implements range validation (`worksheet.dataValidations.add`) but
  // its typings omit it; per-cell `dataValidation` would write 500 entries.
  const validations = (
    sheet as unknown as { dataValidations: RangeValidations }
  ).dataValidations;
  validations.add(`${letter('role')}2:${letter('role')}${last}`, {
    type: 'list',
    allowBlank: false,
    formulae: [`Lists!$A$2:$A$${INVITE_ROLES.length + 1}`],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Invalid role',
    error: 'Pick a role from the list.',
  });

  return workbook.xlsx.writeBuffer();
}

/**
 * Read the first worksheet as a plain table: row 1 is the header row, every
 * cell its text, trimmed; blank rows are skipped. Columns are matched to the
 * template by `planTable`, and values are checked by the draft, so imported
 * rows show their errors in place.
 */
export async function readInviteWorkbook(
  data: ArrayBuffer,
): Promise<UnmappedTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }
  const width = sheet.getRow(1).cellCount;
  const cells = (r: number) =>
    Array.from({ length: width }, (_, c) =>
      sheet
        .getRow(r)
        .getCell(c + 1)
        .text.trim(),
    );
  const rows: Array<Array<string>> = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = cells(r);
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }
  return { headers: cells(1), rows };
}

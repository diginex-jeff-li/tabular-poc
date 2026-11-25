import {
  INVITE_COLUMNS,
  INVITE_FIELDS,
  INVITE_GROUPS,
  INVITE_NAME_LENGTH,
  INVITE_ROLES,
  INVITE_TITLES,
  matchInviteHeader,
  type InviteField,
} from 'contracts';
import ExcelJS from 'exceljs';

/**
 * PROTOTYPE — the Excel side of bulk invite (SC15-706).
 *
 * The template is generated from the same contract lists the grid and the
 * "server" use, so validation still works in Excel:
 * - Email: one "@", text before it, a "." at least one character after it,
 *   no trailing ".", no spaces (the grid's email pattern), unique in the sheet
 * - First/Last name: 1–100 characters
 * - Role: dropdown, rejects anything not in the list
 * - Groups: optional; "; "-separated names, each must be in the group list
 * Excel checks typed entries only: pasted or prefilled cells skip validation
 * (Data → Data Validation → Circle Invalid Data flags them). Excel cannot know
 * which emails already have accounts. Import into the grid re-checks all of it.
 *
 * exceljs ships in the lazily loaded page chunk, not the main bundle.
 */
// Rows that carry validation in the template.
const TEMPLATE_ROWS = 500;

// Excel column letter of a template column (the template has < 26 columns).
const letter = (field: InviteField) =>
  String.fromCharCode(65 + INVITE_FIELDS.indexOf(field));

interface RangeValidations {
  add(range: string, validation: ExcelJS.DataValidation): void;
}

export async function buildInviteWorkbook(
  rows: Array<Record<string, unknown>> = [],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Invites', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const lists = workbook.addWorksheet('Lists', { state: 'veryHidden' });

  lists.getColumn(1).values = ['Roles', ...INVITE_ROLES];
  lists.getColumn(2).values = ['Groups', ...INVITE_GROUPS];

  sheet.columns = INVITE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.field,
    width: 28,
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(
        INVITE_COLUMNS.map((c) => [c.field, row[c.field] ?? null]),
      ),
    );
  }

  const last = Math.max(TEMPLATE_ROWS, rows.length) + 1;
  // exceljs implements range validation (`worksheet.dataValidations.add`) but
  // its typings omit it; per-cell `dataValidation` would write 2,500 entries.
  const validations = (
    sheet as unknown as { dataValidations: RangeValidations }
  ).dataValidations;
  const stop = {
    showErrorMessage: true,
    errorStyle: 'stop' as const,
    showInputMessage: true,
  };
  const { min, max } = INVITE_NAME_LENGTH;
  const name = (title: string) => ({
    ...stop,
    type: 'textLength' as const,
    operator: 'between' as const,
    allowBlank: false,
    formulae: [min, max],
    promptTitle: title,
    prompt: `Required, up to ${max} characters.`,
    errorTitle: `Invalid ${title.toLowerCase()}`,
    error: `Enter ${min}–${max} characters.`,
  });
  const range = (field: InviteField) =>
    `${letter(field)}2:${letter(field)}${last}`;

  // Hand translation of the email rule into Excel formulas: a first-pass
  // check only. Import re-checks every row with the contract's real rules.
  const E = `${letter('email')}2`;
  validations.add(range('email'), {
    ...stop,
    type: 'custom',
    allowBlank: false,
    formulae: [
      `AND(ISERROR(FIND(" ",${E})),LEN(${E})-LEN(SUBSTITUTE(${E},"@",""))=1,LEFT(${E},1)<>"@",ISNUMBER(FIND(".",${E},FIND("@",${E})+2)),RIGHT(${E},1)<>".",COUNTIF($${letter('email')}$2:$${letter('email')}$${last},${E})=1)`,
    ],
    promptTitle: INVITE_TITLES.email,
    prompt: 'Required. Must be unique in this sheet.',
    errorTitle: 'Invalid email',
    error: 'Enter a valid email address that is not already in this sheet.',
  });
  validations.add(range('firstName'), name(INVITE_TITLES.firstName));
  validations.add(range('lastName'), name(INVITE_TITLES.lastName));
  validations.add(range('role'), {
    ...stop,
    type: 'list',
    allowBlank: false,
    formulae: [`Lists!$A$2:$A$${INVITE_ROLES.length + 1}`],
    promptTitle: INVITE_TITLES.role,
    prompt: 'Pick a role from the list.',
    errorTitle: 'Invalid role',
    error: 'Pick a role from the list.',
  });
  // Every ";"-separated item must match a listed group: count items, count
  // listed groups found as whole items, and require the two to be equal.
  const groupsRange = `Lists!$B$2:$B$${INVITE_GROUPS.length + 1}`;
  const G = `${letter('groups')}2`;
  const normalized = `";"&SUBSTITUTE(SUBSTITUTE(${G},"; ",";")," ;",";")&";"`;
  validations.add(range('groups'), {
    ...stop,
    type: 'custom',
    allowBlank: true,
    formulae: [
      `SUMPRODUCT(--ISNUMBER(SEARCH(";"&${groupsRange}&";",${normalized})))=LEN(${G})-LEN(SUBSTITUTE(${G},";",""))+1`,
    ],
    promptTitle: INVITE_TITLES.groups,
    prompt: `Optional. Separate with "; ". Allowed: ${INVITE_GROUPS.join('; ')}`,
    errorTitle: 'Invalid groups',
    error: `Use names from: ${INVITE_GROUPS.join('; ')}`,
  });

  return workbook.xlsx.writeBuffer();
}

export interface ParsedInviteWorkbook {
  rows: Array<Record<string, string | null>>;
  /** Header cells that match no invite column (their data is ignored). */
  ignoredHeaders: Array<string>;
}

/**
 * Read the first worksheet: row 1 is the header, matched to invite columns by
 * header text (case-insensitive), so column order does not matter. Blank
 * rows are skipped; blank cells become null. Values are NOT validated here —
 * the grid and `validateInvites` do that, so imported rows show their errors
 * in place.
 */
export async function parseInviteWorkbook(
  data: ArrayBuffer,
): Promise<ParsedInviteWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], ignoredHeaders: [] };
  }

  const fieldByColumn = new Map<number, string>();
  const ignoredHeaders: Array<string> = [];
  sheet.getRow(1).eachCell((cell, col) => {
    const header = cell.text.trim();
    const field = matchInviteHeader(header);
    if (field) {
      fieldByColumn.set(col, field);
    } else if (header) {
      ignoredHeaders.push(header);
    }
  });

  const rows: Array<Record<string, string | null>> = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const excelRow = sheet.getRow(r);
    const row: Record<string, string | null> = {};
    let blank = true;
    for (const [col, field] of fieldByColumn) {
      const text = excelRow.getCell(col).text.trim();
      row[field] = text || null;
      if (text) {
        blank = false;
      }
    }
    if (!blank) {
      rows.push(row);
    }
  }
  return { rows, ignoredHeaders };
}

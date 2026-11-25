import { INVITE_GROUPS, INVITE_ROLES } from 'contracts';
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
const INVITE_COLUMNS = [
  { field: 'email', header: 'Email' },
  { field: 'firstName', header: 'First Name' },
  { field: 'lastName', header: 'Last Name' },
  { field: 'role', header: 'Role' },
  { field: 'groups', header: 'Groups' },
] as const;

// Rows that carry validation in the template.
const TEMPLATE_ROWS = 500;

interface RangeValidations {
  add(range: string, validation: ExcelJS.DataValidation): void;
}

export async function buildInviteWorkbook(
  rows: Record<string, unknown>[] = [],
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
  const name = (title: string) => ({
    ...stop,
    type: 'textLength' as const,
    operator: 'between' as const,
    allowBlank: false,
    formulae: [1, 100],
    promptTitle: title,
    prompt: 'Required, up to 100 characters.',
    errorTitle: `Invalid ${title.toLowerCase()}`,
    error: 'Enter 1–100 characters.',
  });

  validations.add(`A2:A${last}`, {
    ...stop,
    type: 'custom',
    allowBlank: false,
    formulae: [
      `AND(ISERROR(FIND(" ",A2)),LEN(A2)-LEN(SUBSTITUTE(A2,"@",""))=1,LEFT(A2,1)<>"@",ISNUMBER(FIND(".",A2,FIND("@",A2)+2)),RIGHT(A2,1)<>".",COUNTIF($A$2:$A$${last},A2)=1)`,
    ],
    promptTitle: 'Email',
    prompt: 'Required. Must be unique in this sheet.',
    errorTitle: 'Invalid email',
    error: 'Enter a valid email address that is not already in this sheet.',
  });
  validations.add(`B2:B${last}`, name('First name'));
  validations.add(`C2:C${last}`, name('Last name'));
  validations.add(`D2:D${last}`, {
    ...stop,
    type: 'list',
    allowBlank: false,
    formulae: [`Lists!$A$2:$A$${INVITE_ROLES.length + 1}`],
    promptTitle: 'Role',
    prompt: 'Pick a role from the list.',
    errorTitle: 'Invalid role',
    error: 'Pick a role from the list.',
  });
  // Every ";"-separated item must match a listed group: count items, count
  // listed groups found as whole items, and require the two to be equal.
  const groupsRange = `Lists!$B$2:$B$${INVITE_GROUPS.length + 1}`;
  const normalized = `";"&SUBSTITUTE(SUBSTITUTE(E2,"; ",";")," ;",";")&";"`;
  validations.add(`E2:E${last}`, {
    ...stop,
    type: 'custom',
    allowBlank: true,
    formulae: [
      `SUMPRODUCT(--ISNUMBER(SEARCH(";"&${groupsRange}&";",${normalized})))=LEN(E2)-LEN(SUBSTITUTE(E2,";",""))+1`,
    ],
    promptTitle: 'Groups',
    prompt: `Optional. Separate with "; ". Allowed: ${INVITE_GROUPS.join('; ')}`,
    errorTitle: 'Invalid groups',
    error: `Use names from: ${INVITE_GROUPS.join('; ')}`,
  });

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export interface ParsedInviteWorkbook {
  rows: Record<string, string | null>[];
  /** Header cells that match no invite column (their data is ignored). */
  ignoredHeaders: string[];
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
  if (!sheet) return { rows: [], ignoredHeaders: [] };

  const fieldByHeader = new Map<string, string>(
    INVITE_COLUMNS.map((c) => [c.header.toLowerCase(), c.field]),
  );
  const fieldByColumn = new Map<number, string>();
  const ignoredHeaders: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    const header = cell.text.trim();
    const field = fieldByHeader.get(header.toLowerCase());
    if (field) fieldByColumn.set(col, field);
    else if (header) ignoredHeaders.push(header);
  });

  const rows: Record<string, string | null>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const excelRow = sheet.getRow(r);
    const row: Record<string, string | null> = {};
    let blank = true;
    for (const [col, field] of fieldByColumn) {
      const text = excelRow.getCell(col).text.trim();
      row[field] = text || null;
      if (text) blank = false;
    }
    if (!blank) rows.push(row);
  }
  return { rows, ignoredHeaders };
}

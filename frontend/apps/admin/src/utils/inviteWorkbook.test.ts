import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildInviteWorkbook, parseInviteWorkbook } from './inviteWorkbook';

async function load(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe('buildInviteWorkbook', () => {
  it('carries Excel data validation for every invite column', async () => {
    const sheet = (await load(await buildInviteWorkbook())).getWorksheet(
      'Invites',
    )!;

    expect(sheet.getCell('A2').dataValidation).toMatchObject({
      type: 'custom',
      formulae: [expect.stringContaining('COUNTIF($A$2:$A$501,A2)=1')],
    });
    expect(sheet.getCell('C500').dataValidation).toMatchObject({
      type: 'textLength',
      operator: 'between',
    });
    const role = sheet.getCell('D2').dataValidation;
    expect(role).toMatchObject({ type: 'list', formulae: ['Lists!$A$2:$A$5'] });
    expect(role.allowBlank).toBeFalsy();
    expect(sheet.getCell('E2').dataValidation).toMatchObject({
      type: 'custom',
      allowBlank: true,
    });
  });

  it('round-trips the current rows through parseInviteWorkbook', async () => {
    const rows = [
      {
        email: 'a@acme.com',
        firstName: 'Ann',
        lastName: 'Lee',
        role: 'Viewer',
        groups: null,
      },
      {
        email: 'b@acme.com',
        firstName: 'Bo',
        lastName: 'Chan',
        role: 'Responder',
        groups: 'Apparel; Electronics',
      },
    ];
    const parsed = await parseInviteWorkbook(await buildInviteWorkbook(rows));
    expect(parsed).toEqual({ rows, ignoredHeaders: [] });
  });
});

describe('parseInviteWorkbook', () => {
  it('maps columns by header text, skips blank rows and reports unknown headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Anything');
    sheet.addRow(['role', 'Notes', 'EMAIL', 'First Name', 'Last Name']);
    sheet.addRow(['Viewer', 'ignore me', 'a@acme.com', 'Ann', 'Lee']);
    sheet.addRow([]);
    sheet.addRow(['', '', 'b@acme.com', '', '']);

    const parsed = await parseInviteWorkbook(
      (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
    );

    expect(parsed.ignoredHeaders).toEqual(['Notes']);
    expect(parsed.rows).toEqual([
      {
        role: 'Viewer',
        email: 'a@acme.com',
        firstName: 'Ann',
        lastName: 'Lee',
      },
      { role: null, email: 'b@acme.com', firstName: null, lastName: null },
    ]);
  });
});

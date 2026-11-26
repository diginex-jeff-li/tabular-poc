import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vite-plus/test';
import { buildInviteWorkbook, readInviteWorkbook } from './inviteWorkbook';

async function load(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe('buildInviteWorkbook', () => {
  it('carries Excel data validation for every invite column', async () => {
    const sheet = (await load(await buildInviteWorkbook())).getWorksheet(
      'Invites',
    );

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

  it('round-trips the current rows through readInviteWorkbook as text', async () => {
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
    expect(await readInviteWorkbook(await buildInviteWorkbook(rows))).toEqual({
      headers: ['Email', 'First Name', 'Last Name', 'Role', 'Groups'],
      rows: [
        ['a@acme.com', 'Ann', 'Lee', 'Viewer', ''],
        ['b@acme.com', 'Bo', 'Chan', 'Responder', 'Apparel; Electronics'],
      ],
    });
  });
});

describe('readInviteWorkbook', () => {
  it('reads the first sheet as header text and row text, skipping blank rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Anything');
    sheet.addRow(['role', ' Notes ', 'E-mail', 'Given name', 'Surname']);
    sheet.addRow(['Viewer', 'ignore me', 'a@acme.com', 'Ann', 42]);
    sheet.addRow([]);
    sheet.addRow(['', '  ', 'b@acme.com', '', '']);
    workbook.addWorksheet('Second').addRow(['Email']);

    expect(await readInviteWorkbook(await workbook.xlsx.writeBuffer())).toEqual(
      {
        headers: ['role', 'Notes', 'E-mail', 'Given name', 'Surname'],
        rows: [
          ['Viewer', 'ignore me', 'a@acme.com', 'Ann', '42'],
          ['', '', 'b@acme.com', '', ''],
        ],
      },
    );
  });
});

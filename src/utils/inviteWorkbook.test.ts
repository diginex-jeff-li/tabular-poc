import { INVITE_GROUPS, INVITE_ROLES } from 'contracts';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vite-plus/test';
import { buildInviteWorkbook, readInviteWorkbook } from './inviteWorkbook';

async function load(data: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook;
}

describe('buildInviteWorkbook', () => {
  it('notes each header with its rules and validates only the Role column', async () => {
    const sheet = (await load(await buildInviteWorkbook())).getWorksheet(
      'Invites',
    );

    const noteText = (address: string) => {
      const { note } = sheet.getCell(address);
      return typeof note === 'string'
        ? note
        : note?.texts?.map((t) => t.text).join('');
    };
    expect(['A1', 'B1', 'C1', 'D1', 'E1'].map(noteText)).toEqual([
      'Email (required)\nA valid email address, unique in this sheet.',
      'First Name (required)\nUp to 100 characters.',
      'Last Name (required)\nUp to 100 characters.',
      `Role (required)\nPick from the list: ${INVITE_ROLES.join(', ')}.`,
      `Groups (optional)\nSeparate with "; ". Allowed: ${INVITE_GROUPS.join('; ')}.`,
    ]);

    const role = sheet.getCell('D2').dataValidation;
    expect(role).toMatchObject({ type: 'list', formulae: ['Lists!$A$2:$A$5'] });
    expect(role.allowBlank).toBeFalsy();
    expect(sheet.getCell('D501').dataValidation).toMatchObject({
      type: 'list',
    });
    for (let r = 2; r <= 501; r++) {
      for (const col of ['A', 'B', 'C', 'E']) {
        expect(sheet.getCell(`${col}${r}`).dataValidation).toBeUndefined();
      }
    }
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

import { describe, expect, it } from 'vitest';
import { needsReview, normalizeInviteRow } from './inviteDraft';

const line = (text: string) => normalizeInviteRow({ id: 'r', email: text });

describe('normalizeInviteRow — cleaning a structured row', () => {
  it('trims, lowercases the email and spells role and groups canonically', () => {
    expect(
      normalizeInviteRow({
        id: 'r',
        email: '  Ann.Lee@Acme.COM ',
        firstName: ' Ann ',
        lastName: 'Lee',
        role: 'responder',
        groups: 'vietnam suppliers ;apparel',
      }),
    ).toEqual({
      id: 'r',
      email: 'ann.lee@acme.com',
      firstName: 'Ann',
      lastName: 'Lee',
      role: 'Responder',
      groups: 'Vietnam Suppliers; Apparel',
    });
  });

  it('keeps unknown values as typed so the validator can name them', () => {
    const row = normalizeInviteRow({
      id: 'r',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: 'Owner',
      groups: 'Mars',
    });
    expect(row).toMatchObject({ role: 'Owner', groups: 'Mars' });
  });

  it('is idempotent', () => {
    const once = line(
      'Bo Chan bo@x.com assessment manager vietnam suppliers; apparel',
    );
    expect(normalizeInviteRow(once)).toEqual(once);
  });
});

// Rebuilt from the 19-line Codex demo paste (tabs lost, so each line landed
// whole in Email), plus multi-word role/group cases.
describe('normalizeInviteRow — splitting a whole line in one cell', () => {
  const cases: [string, Record<string, string | null>][] = [
    // the 12 rows Codex split by hand
    [
      'Ann Lee ann@x.com Account Admin',
      {
        email: 'ann@x.com',
        firstName: 'Ann',
        lastName: 'Lee',
        role: 'Account Admin',
        groups: null,
      },
    ],
    [
      'Bo Chan bo@x.com assessment manager vietnam suppliers; apparel',
      {
        email: 'bo@x.com',
        firstName: 'Bo',
        lastName: 'Chan',
        role: 'Assessment Manager',
        groups: 'Vietnam Suppliers; Apparel',
      },
    ],
    [
      'Mia Tran mia.tran@acme.com Responder Vietnam Suppliers',
      {
        email: 'mia.tran@acme.com',
        firstName: 'Mia',
        lastName: 'Tran',
        role: 'Responder',
        groups: 'Vietnam Suppliers',
      },
    ],
    [
      'Leo Park leo.park@acme.com Viewer',
      {
        email: 'leo.park@acme.com',
        firstName: 'Leo',
        lastName: 'Park',
        role: 'Viewer',
        groups: null,
      },
    ],
    [
      'Ava Khan ava.khan@acme.com responder bangladesh suppliers electronics',
      {
        email: 'ava.khan@acme.com',
        firstName: 'Ava',
        lastName: 'Khan',
        role: 'Responder',
        groups: 'Bangladesh Suppliers; Electronics',
      },
    ],
    [
      'Max Wu MAX.WU@ACME.COM VIEWER APPAREL',
      {
        email: 'max.wu@acme.com',
        firstName: 'Max',
        lastName: 'Wu',
        role: 'Viewer',
        groups: 'Apparel',
      },
    ],
    [
      'zoe.li@acme.com Zoe Li Account Admin',
      {
        email: 'zoe.li@acme.com',
        firstName: 'Zoe',
        lastName: 'Li',
        role: 'Account Admin',
        groups: null,
      },
    ],
    [
      'jane.doe@acme.com, Jane, Doe, Viewer, Apparel',
      {
        email: 'jane.doe@acme.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'Viewer',
        groups: 'Apparel',
      },
    ],
    [
      'ken.ito@acme.com | Ken | Ito | Responder | Electronics; Apparel',
      {
        email: 'ken.ito@acme.com',
        firstName: 'Ken',
        lastName: 'Ito',
        role: 'Responder',
        groups: 'Electronics; Apparel',
      },
    ],
    [
      'lia.ono@acme.com\tLia\tOno\tViewer\t',
      {
        email: 'lia.ono@acme.com',
        firstName: 'Lia',
        lastName: 'Ono',
        role: 'Viewer',
        groups: null,
      },
    ],
    [
      'ben.ho@acme.com,Ben,Ho,assessment manager',
      {
        email: 'ben.ho@acme.com',
        firstName: 'Ben',
        lastName: 'Ho',
        role: 'Assessment Manager',
        groups: null,
      },
    ],
    [
      'Uma Das uma.das@acme.com Responder Apparel Electronics',
      {
        email: 'uma.das@acme.com',
        firstName: 'Uma',
        lastName: 'Das',
        role: 'Responder',
        groups: 'Apparel; Electronics',
      },
    ],
    // malformed emails: the column is clear, the validator flags the value
    [
      'Nora Hale nora@acme Viewer',
      {
        email: 'nora@acme',
        firstName: 'Nora',
        lastName: 'Hale',
        role: 'Viewer',
        groups: null,
      },
    ],
    [
      'Sam Ng sam.ng@acme..com Responder',
      {
        email: 'sam.ng@acme..com',
        firstName: 'Sam',
        lastName: 'Ng',
        role: 'Responder',
        groups: null,
      },
    ],
    [
      'Raj Kumar raj.k@@acme.com Viewer Apparel',
      {
        email: 'raj.k@@acme.com',
        firstName: 'Raj',
        lastName: 'Kumar',
        role: 'Viewer',
        groups: 'Apparel',
      },
    ],
    // unknown group, but separators make every column clear
    [
      'ian.ross@acme.com, Ian, Ross, Responder, Mars',
      {
        email: 'ian.ross@acme.com',
        firstName: 'Ian',
        lastName: 'Ross',
        role: 'Responder',
        groups: 'Mars',
      },
    ],
    [
      'eli.cohen@acme.com\tEli\tCohen\tViewer\tMoon',
      {
        email: 'eli.cohen@acme.com',
        firstName: 'Eli',
        lastName: 'Cohen',
        role: 'Viewer',
        groups: 'Moon',
      },
    ],
  ];

  it.each(cases)('splits %j', (text, expected) => {
    const row = line(text);
    expect(row).toEqual({ id: 'r', ...expected });
    expect(needsReview(row)).toBe(false);
  });

  it.each([
    ['unknown word where a role should be', 'Tom Lee tom.lee@acme.com Owner'],
    ['space inside the email', 'Kim Park kim park@acme.com Responder'],
    ['no email', 'Pat Roe Viewer'],
    ['two emails', 'Pat Roe pat@x.com roe@x.com Viewer'],
    ['two roles', 'Pat Roe pat@x.com Viewer Responder'],
    ['wrong number of separated pieces', 'pat@x.com, Pat, Viewer'],
  ])('leaves the line as typed and needs review: %s', (_why, text) => {
    const row = line(text);
    expect(row).toEqual({ id: 'r', email: text.trim() });
    expect(needsReview(row)).toBe(true);
  });

  it('does not re-parse a row with more than one filled cell', () => {
    const row = normalizeInviteRow({
      id: 'r',
      email: 'Tom Lee tom@x.com',
      role: 'Viewer',
    });
    expect(row.email).toBe('tom lee tom@x.com');
    expect(needsReview(row)).toBe(false);
  });

  it('does not treat a single word as a line', () => {
    const row = line('ann@x.com');
    expect(row.email).toBe('ann@x.com');
    expect(needsReview(row)).toBe(false);
  });
});

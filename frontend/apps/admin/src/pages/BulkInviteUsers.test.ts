import { flushPromises, mount } from '@vue/test-utils';
import { useGridLayout } from 'components/DataGrid/testLayout';
import { buildInviteWorkbook } from 'utils/inviteWorkbook';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import BulkInviteUsers from './BulkInviteUsers';
import type { VueWrapper } from '@vue/test-utils';

type Bridge = {
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

useGridLayout();

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  // The page keeps its draft in localStorage; each test starts empty.
  localStorage.clear();
});

async function mountPage() {
  wrapper = mount(BulkInviteUsers, { attachTo: document.body });
  // Agent tools and the grid's root listeners attach after mount.
  await flushPromises();
  if (!('scInvite' in window)) {
    throw new Error('Agent tools are not registered on window');
  }
  // Shape set by useAgentTools.
  const agent = window.scInvite as Bridge;
  return { w: wrapper, agent };
}

const statusOf = (w: VueWrapper, rowId: string) =>
  w.get(`[data-row-id="${rowId}"][data-col-id="status"]`);
const button = (w: VueWrapper, label: string) =>
  w.findAll('button').find((b) => b.text() === label);
const emails = (w: VueWrapper) =>
  w.findAll('[data-col-id="email"]').map((cell) => cell.text());

/** A paste on the grid root; happy-dom's ClipboardEvent carries no data. */
async function paste(w: VueWrapper, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  w.get('[data-slot="root"][tabindex]').element.dispatchEvent(event);
  await flushPromises();
}

describe('BulkInviteUsers', () => {
  it('shows Status first, and an agent-resolved line waits for Confirm before Send passes', async () => {
    const { w, agent } = await mountPage();
    expect(w.findAll('th')[0].text()).toBe('Status');

    const { added } = (await agent.call('add_rows', {
      rows: [{ email: 'Tom Lee tom@acme.com Owner' }],
    })) as { added: Array<string> };
    await flushPromises();
    const [tom] = added;
    expect(statusOf(w, tom).text()).toBe('Needs review');

    await agent.call('update_rows', {
      rows: [
        {
          id: tom,
          email: 'tom@acme.com',
          firstName: 'Tom',
          lastName: 'Lee',
          role: 'Viewer',
        },
      ],
    });
    await flushPromises();
    expect(statusOf(w, tom).text()).toContain('Agent proposed');
    expect(statusOf(w, tom).get('button').text()).toBe('Confirm');

    await button(w, 'Send invites')?.trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('Simulated');

    await statusOf(w, tom).get('button').trigger('click');
    expect(statusOf(w, tom).text()).toBe('Ready');

    await button(w, 'Send invites')?.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Simulated — no invitations sent (1 valid)');
  });

  it('pastes by header name, positionally past Status, or holds an unmapped table', async () => {
    const { w } = await mountPage();

    await paste(
      w,
      'E-mail\tGiven name\tSurname\tPermission\nann@acme.com\tAnn\tLee\tViewer',
    );
    await paste(w, 'bo@acme.com\tBo\tKim\tViewer');
    expect(emails(w)).toEqual(['ann@acme.com', 'bo@acme.com']);
    expect(w.findAll('[data-col-id="status"]').map((c) => c.text())).toEqual([
      'Ready',
      'Ready',
    ]);

    await paste(w, 'Email\tNotes\nzed@acme.com\thello');
    expect(button(w, 'Apply mapping')).toBeDefined();
    expect(emails(w)).toHaveLength(2);
  });

  it('imports an .xlsx through the hidden file input', async () => {
    const { w } = await mountPage();
    const data = await buildInviteWorkbook([
      {
        email: 'cy@acme.com',
        firstName: 'Cy',
        lastName: 'Ng',
        role: 'Viewer',
        groups: null,
      },
    ]);
    const input = w.get('[data-testid="invite-import"]')
      .element as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File([data], 'people.xlsx')],
    });
    input.dispatchEvent(new Event('change'));
    // ExcelJS reads the file over several macrotasks.
    await vi.waitFor(() => expect(emails(w)).toEqual(['cy@acme.com']));
    expect(w.text()).toContain('Imported 1 row(s) from people.xlsx');
  });
});

describe('BulkInviteUsers undo', () => {
  /** ⌘Z on the grid root. */
  async function undo(w: VueWrapper) {
    w.get('[data-slot="root"][tabindex]').element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushPromises();
  }
  const firstName = (w: VueWrapper, rowId: string) =>
    w.get(`[data-row-id="${rowId}"][data-col-id="firstName"]`);

  it('never undoes an agent write or a Confirm; a person edit after them still undoes', async () => {
    const { w, agent } = await mountPage();
    await paste(w, 'bo@acme.com\tBo\tKim\tViewer');
    const [bo] = w
      .findAll('[data-col-id="email"]')
      .map((c) => c.attributes('data-row-id') ?? '');
    const { added } = (await agent.call('add_rows', {
      rows: [{ email: 'Tom Lee tom@acme.com Owner' }],
    })) as { added: Array<string> };
    const [tom] = added;
    await agent.call('update_rows', {
      rows: [
        {
          id: tom,
          email: 'tom@acme.com',
          firstName: 'Tom',
          lastName: 'Lee',
          role: 'Viewer',
        },
      ],
    });
    await flushPromises();
    expect(statusOf(w, tom).text()).toContain('Agent proposed');

    // The agent's writes emptied the history: the person's paste stays too.
    await undo(w);
    expect(emails(w)).toEqual(['bo@acme.com', 'tom@acme.com']);
    expect(statusOf(w, tom).text()).toContain('Agent proposed');

    await firstName(w, bo).trigger('dblclick');
    const input = firstName(w, bo).get('[data-grid-editor] input');
    await input.setValue('Bob');
    await input.trigger('keydown', { key: 'Enter' });
    await statusOf(w, tom).get('button').trigger('click');
    expect(statusOf(w, tom).text()).toBe('Ready');

    await undo(w);
    expect(firstName(w, bo).text()).toBe('Bo');
    expect(statusOf(w, tom).text()).toBe('Ready');
    await button(w, 'Send invites')?.trigger('click');
    await flushPromises();
    expect(w.text()).toContain('Simulated — no invitations sent (2 valid)');
  });
});

describe('BulkInviteUsers draft in localStorage', () => {
  it('brings an unsent draft back after a reload, still waiting for Confirm', async () => {
    const first = await mountPage();
    const { added } = (await first.agent.call('add_rows', {
      rows: [
        {
          email: 'ann@acme.com',
          firstName: 'Ann',
          lastName: 'Lee',
          role: 'Viewer',
        },
        { email: 'Tom Lee tom@acme.com Owner' },
      ],
    })) as { added: Array<string> };
    await first.agent.call('update_rows', {
      rows: [
        {
          id: added[1],
          email: 'tom@acme.com',
          firstName: 'Tom',
          lastName: 'Lee',
          role: 'Viewer',
        },
      ],
    });
    await flushPromises();
    wrapper?.unmount();

    const { w } = await mountPage();
    expect(emails(w)).toEqual(['ann@acme.com', 'tom@acme.com']);
    // Without the stored agent-proposed mark, Tom would pass the Send gate.
    expect(
      w.findAll('[data-col-id="status"]').map((cell) => cell.text()),
    ).toEqual(['Ready', 'Agent proposedConfirm']);
    // The restored rows are unsent, so Send is available.
    expect(button(w, 'Send invites')?.attributes('disabled')).toBeUndefined();
  });

  it.each([
    ['an old shape', '{"version":0,"rows":"x"}'],
    ['broken JSON', '{"version":1,"rows":['],
  ])('starts empty when the stored draft is %s', async (_, raw) => {
    localStorage.setItem('sc.invite-users.draft', raw);
    const { w } = await mountPage();
    expect(emails(w)).toEqual([]);
  });
});

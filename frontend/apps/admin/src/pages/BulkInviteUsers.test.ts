import { flushPromises, mount } from '@vue/test-utils';
import { useGridLayout } from 'components/DataGrid/testLayout';
import { buildInviteWorkbook } from 'utils/inviteWorkbook';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import BulkInviteUsers from './BulkInviteUsers';
import type { VueWrapper } from '@vue/test-utils';

// The TanStack build of the page. The Tabulator build needs a real browser
// (its engine is mocked in unit tests) and is checked there.
type Bridge = {
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

useGridLayout();

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

async function mountPage() {
  wrapper = mount(BulkInviteUsers, {
    attachTo: document.body,
    props: { engine: 'tanstack' },
  });
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

describe('BulkInviteUsers (TanStack engine)', () => {
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

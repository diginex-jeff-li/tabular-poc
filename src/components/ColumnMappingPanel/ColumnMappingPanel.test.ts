import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vite-plus/test';
import ColumnMappingPanel from './ColumnMappingPanel';
import type { HeldTable } from 'utils/inviteDraft';

const table = {
  headers: ['Email', 'Given name', 'Surname', 'Access'],
  rows: [['cy@acme.com', 'Cy', 'Ng', 'Viewer']],
};

function mountPanel(held: HeldTable) {
  const onChange = vi.fn();
  const onApply = vi.fn();
  const onDiscard = vi.fn();
  const w = mount(ColumnMappingPanel, {
    props: { held, onChange, onApply, onDiscard },
  });
  const apply = w.findAll('button').find((b) => b.text() === 'Apply mapping');
  if (!apply) {
    throw new Error('Apply mapping button not rendered');
  }
  return { w, apply, onChange, onApply };
}

describe('ColumnMappingPanel', () => {
  it('lists the held table’s problems and keeps Apply disabled', async () => {
    const { w, apply, onApply } = mountPanel({
      table,
      mapping: ['email', 'firstName', 'lastName', null],
      problems: ['No column for Role'],
      agentColumns: [],
    });
    expect(w.findAll('li').map((li) => li.text())).toEqual([
      'No column for Role',
    ]);
    expect(apply.attributes('disabled')).toBeDefined();
    await apply.trigger('click');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('reports a changed select as the column and its template field', async () => {
    const { w, onChange } = mountPanel({
      table,
      mapping: ['email', 'firstName', 'lastName', null],
      problems: ['No column for Role'],
      agentColumns: [],
    });
    await w
      .get('select[aria-label="Template column for Access"]')
      .setValue('role');
    expect(onChange).toHaveBeenCalledWith(3, 'role');
    await w.get('select[aria-label="Template column for Email"]').setValue('');
    expect(onChange).toHaveBeenLastCalledWith(0, null);
  });

  it('applies a held table without problems', async () => {
    const { w, apply, onApply } = mountPanel({
      table,
      mapping: ['email', 'firstName', 'lastName', 'role'],
      problems: [],
      agentColumns: [3],
    });
    expect(w.findAll('li')).toEqual([]);
    expect(w.text()).toContain('Agent proposed');
    await apply.trigger('click');
    expect(onApply).toHaveBeenCalledOnce();
  });
});

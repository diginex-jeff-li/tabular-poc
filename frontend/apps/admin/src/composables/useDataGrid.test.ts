import { describe, it, expect } from 'vite-plus/test';
import { useDataGrid } from './useDataGrid';

describe('useDataGrid', () => {
  it('starts with the given rows in order and counts them', () => {
    const { rows, rowCount } = useDataGrid({
      data: [
        { id: 'a', name: 'Ann' },
        { id: 'b', name: 'Bo' },
      ],
    });
    expect(rows.value).toEqual([
      { id: 'a', name: 'Ann' },
      { id: 'b', name: 'Bo' },
    ]);
    expect(rowCount.value).toBe(2);
  });

  it('gives a row without an id a unique one and keeps its fields', () => {
    const { rows } = useDataGrid({
      data: [{ name: 'Ann' }, { id: '', name: 'Bo' }],
    });
    const [ann, bo] = rows.value;
    expect(ann).toMatchObject({ name: 'Ann', id: expect.any(String) });
    expect(bo).toMatchObject({ name: 'Bo', id: expect.any(String) });
    expect(ann.id).not.toBe('');
    expect(bo.id).not.toBe('');
    expect(ann.id).not.toBe(bo.id);
  });
});

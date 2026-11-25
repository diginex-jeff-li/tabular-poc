import { describe, it, expect } from 'vite-plus/test';
import { buildSavePayload, diffRows } from './gridDiff';

const ann = { id: 'a', name: 'Ann', role: 'admin' };
const bo = { id: 'b', name: 'Bo', role: 'viewer' };

describe('diffRows + buildSavePayload', () => {
  it('sends nothing when the rows match the snapshot', () => {
    expect(buildSavePayload(diffRows([ann, bo], [ann, bo]))).toEqual({
      upserts: [],
      deletes: [],
    });
  });

  it('sends a row added and then deleted before saving nowhere', () => {
    const added = { id: 'new' };
    const afterAdd = [added, ann];
    expect(diffRows([ann], afterAdd).added).toEqual([added]);
    const afterDelete = afterAdd.filter((row) => row.id !== 'new');
    expect(buildSavePayload(diffRows([ann], afterDelete))).toEqual({
      upserts: [],
      deletes: [],
    });
  });

  it('upserts an edited row with its current fields', () => {
    const edited = { ...ann, name: 'Anne' };
    expect(buildSavePayload(diffRows([ann, bo], [edited, bo]))).toEqual({
      upserts: [{ id: 'a', name: 'Anne', role: 'admin' }],
      deletes: [],
    });
  });

  it('is not dirty after an edit is reverted', () => {
    // The edit replaced the row; reverting replaces it again with the old values.
    const reverted = { id: 'a', name: 'Ann', role: 'admin' };
    expect(buildSavePayload(diffRows([ann], [reverted]))).toEqual({
      upserts: [],
      deletes: [],
    });
  });

  it('deletes a saved row that is removed after the save', () => {
    // The snapshot is reset to the saved rows, so a later removal is a delete.
    const saved = [ann, bo];
    expect(buildSavePayload(diffRows(saved, [bo]))).toEqual({
      upserts: [],
      deletes: ['a'],
    });
  });

  it('sends every saved row as a delete when the grid is cleared', () => {
    expect(buildSavePayload(diffRows([ann, bo], []))).toEqual({
      upserts: [],
      deletes: ['a', 'b'],
    });
  });

  it('treats a missing field and an undefined field as equal', () => {
    expect(
      buildSavePayload(diffRows([ann], [{ ...ann, note: undefined }])),
    ).toEqual({ upserts: [], deletes: [] });
  });

  it('treats a blank cleared to null as a change', () => {
    const blank = { id: 'c', note: '' };
    expect(diffRows([blank], [{ id: 'c', note: null }]).modified).toEqual([
      { id: 'c', note: null },
    ]);
  });

  it('compares rows after normalizeRow, on both sides', () => {
    const trim = (row: Record<string, unknown>) => ({
      ...row,
      name: String(row.name).trim(),
    });
    expect(
      buildSavePayload(diffRows([ann], [{ ...ann, name: ' Ann ' }], trim)),
    ).toEqual({ upserts: [], deletes: [] });
  });
});

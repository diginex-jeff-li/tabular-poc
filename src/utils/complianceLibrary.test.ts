import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createComplianceLibrary } from './complianceLibrary';
import type { ComplianceLibrary } from './complianceLibrary';
import type { Row } from './gridApi';
import type { SavePayload } from './gridDiff';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const LOADED = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-01T00:00:00.000Z';
/** The save stamps rows when it completes, 300 ms after it starts. */
const SAVED = '2026-02-01T00:00:00.300Z';

function entry(id: string, issue: string): Row {
  return {
    id,
    categoryCode: 'A',
    complianceCategory: 'Governance',
    topic: 'Key Compliance Requirements',
    riskLevel: 'High',
    issue,
    closureTiming: '30',
    evidenceExpectation: null,
    bestPractice: null,
  };
}

const stored = (id: string, issue: string) => ({
  ...entry(id, issue),
  createdAt: LOADED,
  updatedAt: LOADED,
});

/** Runs a save through the 300 ms delay and returns its result. */
async function save(library: ComplianceLibrary, payload: SavePayload) {
  const pending = library.save(payload);
  await vi.advanceTimersByTimeAsync(300);
  return pending;
}

describe('compliance library save (onSave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(LATER));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects the whole save when an upsert fails the schema, one error per field, and changes nothing', async () => {
    const library = createComplianceLibrary([stored(A, 'Kept')]);
    const result = await save(library, {
      upserts: [
        entry(B, 'Fine'),
        { ...entry(C, 'Bad'), riskLevel: 'Extreme', closureTiming: '1' },
      ],
      deletes: [A],
    });

    expect(result.saved).toBe(0);
    expect(result.errors.map(({ rowId, field }) => ({ rowId, field }))).toEqual(
      [
        { rowId: C, field: 'riskLevel' },
        { rowId: C, field: 'closureTiming' },
      ],
    );
    expect(library.list()).toEqual([stored(A, 'Kept')]);
  });

  it('applies deletes before upserts, so a deleted and re-sent id comes back as new', async () => {
    const library = createComplianceLibrary([stored(A, 'Old')]);
    await save(library, { upserts: [entry(A, 'Again')], deletes: [A] });

    expect(library.list()).toEqual([
      { ...entry(A, 'Again'), createdAt: SAVED, updatedAt: SAVED },
    ]);
  });

  it('keeps createdAt on an update and stamps both times on an insert', async () => {
    const library = createComplianceLibrary([stored(A, 'Old')]);
    await save(library, {
      upserts: [entry(A, 'Edited'), entry(B, 'New')],
      deletes: [],
    });

    expect(library.list()).toEqual([
      { ...entry(A, 'Edited'), createdAt: LOADED, updatedAt: SAVED },
      { ...entry(B, 'New'), createdAt: SAVED, updatedAt: SAVED },
    ]);
  });

  it('counts upserts plus deletes as saved', async () => {
    const library = createComplianceLibrary([
      stored(A, 'One'),
      stored(B, 'Two'),
    ]);
    const result = await save(library, {
      upserts: [entry(C, 'Three')],
      deletes: [A, B],
    });

    expect(result).toEqual({ errors: [], saved: 3 });
    expect(library.list().map((row) => row.id)).toEqual([C]);
  });
});

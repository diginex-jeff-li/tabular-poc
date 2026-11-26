import { ComplianceLibrarySchema } from 'contracts';
import { fieldProblems } from 'utils/gridApi';
import type { GridSaveResponse } from 'utils/gridApi';
import type { SavePayload } from 'utils/gridDiff';

/**
 * PROTOTYPE — the compliance library's fake backend: an in-memory store of
 * compliance library rows, seeded once, with the bulk save `DataGrid` calls
 * as `onSave`. NOT PRODUCTION.
 */

type Row = Record<string, unknown>;

const UpsertSchema = ComplianceLibrarySchema.omit({
  createdAt: true,
  updatedAt: true,
});

const SEED_ROWS: Array<Row> = [
  {
    id: crypto.randomUUID(),
    categoryCode: 'A',
    complianceCategory: 'Governance',
    topic: 'Key Compliance Requirements',
    riskLevel: 'High',
    issue: 'Facility operating without valid business license',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'A',
    complianceCategory: 'Governance',
    topic: 'Key Compliance Requirements',
    riskLevel: 'Medium',
    issue:
      'Legally required labor contracts missing for >10% of sampled workers',
    closureTiming: '60',
    evidenceExpectation: 'Evidence within 60 days',
    bestPractice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'B',
    complianceCategory: 'Social',
    topic: 'Zero Tolerance Policy',
    riskLevel: 'High',
    issue: 'Child labor observed on premises',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: 'Verify age documentation for all workers',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'C',
    complianceCategory: 'Social',
    topic: 'Freedom of Association',
    riskLevel: 'High',
    issue: 'Evidence of prison labor',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'F',
    complianceCategory: 'Social',
    topic: 'Wages & Benefits',
    riskLevel: 'High',
    issue: 'Non-payment of wages exceeding 1 month',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: 'Maintain proper records; provide clear pay slips',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'H',
    complianceCategory: 'Social',
    topic: 'Occupational Safety & Health',
    riskLevel: 'High',
    issue:
      'Conditions presenting imminent threat of injury (locked exits/no fire equipment)',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'I',
    complianceCategory: 'Environment',
    topic: 'Environmental Responsibility',
    riskLevel: 'High',
    issue: 'Illegal wastewater discharge',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'M',
    complianceCategory: 'Governance',
    topic: 'Compliance Requirements',
    riskLevel: 'High',
    issue: 'Full denial of audit access',
    closureTiming: '7',
    evidenceExpectation: 'Immediate notification required',
    bestPractice: 'Never deny access to facility/documents/workers',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'P',
    complianceCategory: 'Social',
    topic: 'Recruitment & Fees',
    riskLevel: 'High',
    issue: 'Workers charged recruitment fees by employer or agents',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice: 'No worker should pay for a job; all fees borne by employer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    categoryCode: 'Q',
    complianceCategory: 'Social',
    topic: 'Forced & Compulsory Labour',
    riskLevel: 'High',
    issue: 'Physical or sexual violence against workers',
    closureTiming: '30',
    evidenceExpectation: 'Evidence within 30 days',
    bestPractice:
      'ILO indicators: abuse of vulnerability; deception; restriction of movement',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/** The fake backend `DataGrid` saves to; `save` is its `onSave`. */
export interface ComplianceLibrary {
  /** The stored rows, in store order. */
  list: () => Array<Row>;
  /**
   * After 300 ms: if any upsert fails the schema, returns one error per
   * failing field and changes nothing. Otherwise applies the deletes, then
   * the upserts (an update keeps `createdAt`; both set `updatedAt`).
   */
  save: (payload: SavePayload) => Promise<GridSaveResponse>;
}

export function createComplianceLibrary(
  seed: ReadonlyArray<Row>,
): ComplianceLibrary {
  let store: Array<Row> = [...seed];

  return {
    list() {
      return [...store];
    },
    async save(payload) {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      const errors = payload.upserts.flatMap((row) => {
        const result = UpsertSchema.safeParse(row);
        return result.success
          ? []
          : fieldProblems(result.error).map((problem) => ({
              rowId: String(row.id),
              ...problem,
            }));
      });

      if (errors.length > 0) {
        return { errors, saved: 0 };
      }

      const deleteSet = new Set(payload.deletes);
      store = store.filter((r) => !deleteSet.has(r.id as string));

      for (const upsert of payload.upserts) {
        const idx = store.findIndex((r) => r.id === upsert.id);
        const now = new Date().toISOString();
        if (idx >= 0) {
          store[idx] = {
            ...upsert,
            createdAt: store[idx].createdAt,
            updatedAt: now,
          };
        } else {
          store.push({ ...upsert, createdAt: now, updatedAt: now });
        }
      }

      return {
        errors: [],
        saved: payload.upserts.length + payload.deletes.length,
      };
    },
  };
}

/** The page's library: one per session, so edits survive leaving the page. */
export const complianceLibrary = createComplianceLibrary(SEED_ROWS);

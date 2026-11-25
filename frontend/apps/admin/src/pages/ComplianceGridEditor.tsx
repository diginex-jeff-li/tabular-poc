import GridEditor from 'components/GridEditor';
import { buildComplianceColumns } from 'composables/buildComplianceColumns';
import { ComplianceLibrarySchema } from 'contracts';
/**
 * PROTOTYPE — Compliance Library Grid Editor
 *
 * Thin wrapper over the shared GridEditor component (the grid engine's
 * presentation). This page owns only compliance-specific material: the
 * contracts schema, SEED_ROWS, the in-memory mock store, mockList,
 * mockBulkSave, and buildComplianceColumns(). It renders a single
 * <GridEditor> element.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import { defineComponent } from 'vue';
import type { BulkSaveErrorType, BulkSaveResponseType } from 'contracts';
import type { VNode } from 'vue';

// ── Derived from the shared contracts schema ──

const UpsertSchema = ComplianceLibrarySchema.omit({
  createdAt: true,
  updatedAt: true,
});

type BackendError = BulkSaveErrorType;
type SaveResponse = BulkSaveResponseType;

// ── Mock backend with in-memory persistence ──

const SEED_ROWS: Array<Record<string, unknown>> = [
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

let store: Array<Record<string, unknown>> = [...SEED_ROWS];

function mockList(): Array<Record<string, unknown>> {
  return [...store];
}

async function mockBulkSave(payload: {
  upserts: Array<Record<string, unknown>>;
  deletes: Array<string>;
}): Promise<SaveResponse> {
  await new Promise((r) => setTimeout(r, 300));
  const errors: Array<BackendError> = [];

  for (let i = 0; i < payload.upserts.length; i++) {
    const row = payload.upserts[i];
    const result = UpsertSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: i,
          rowId: row.id as string,
          field: issue.path[0]?.toString() ?? '?',
          message: issue.message,
        });
      }
    }
  }

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

  return { errors: [], saved: payload.upserts.length + payload.deletes.length };
}

export default defineComponent({
  name: 'ComplianceGridEditor',
  setup() {
    const columns = buildComplianceColumns();

    return (): VNode => (
      <GridEditor
        columns={columns}
        data={mockList()}
        onSave={mockBulkSave}
        title="Compliance Library Editor"
        exportFilename="compliance-library.csv"
      />
    );
  },
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../app.module.js';

async function createTestApp(): Promise<{
  app: NestExpressApplication;
}> {
  process.env.NODE_ENV = 'test';
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  await app.init();

  return { app };
}

describe('ComplianceLibrary oRPC routes (E2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const harness = await createTestApp();
    app = harness.app;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('listComplianceLibrary', () => {
    it('returns paginated list with default pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/compliance-library');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0);
      expect(res.body.meta.currentPage).toBe(1);
      expect(res.body.meta.perPage).toBe(20);
    });

    it('respects custom pagination params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/compliance-library')
        .query({ page: 1, perPage: 5 });

      expect(res.status).toBe(200);
      expect(res.body.meta.perPage).toBe(5);
      expect(res.body.meta.currentPage).toBe(1);
    });

    it('returns seeded sample data on first request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/compliance-library');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const item = res.body.data[0];
      expect(item.id).toBeDefined();
      expect(item.categoryCode).toBeDefined();
      expect(item.complianceCategory).toBeDefined();
      expect(item.topic).toBeDefined();
      expect(item.riskLevel).toBeDefined();
      expect(item.issue).toBeDefined();
      expect(item.closureTiming).toBeDefined();
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });
  });

  describe('bulkSaveComplianceLibrary', () => {
    it('saves new items and returns saved count', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              categoryCode: 'A',
              complianceCategory: 'Governance',
              topic: 'Key Compliance Requirements',
              riskLevel: 'High',
              issue: 'Test issue 1',
              closureTiming: '7',
              evidenceExpectation: 'Evidence 1',
              bestPractice: 'Best practice 1',
            },
            {
              id: '00000000-0000-0000-0000-000000000002',
              categoryCode: 'B',
              complianceCategory: 'Social',
              topic: 'Freedom of Association',
              riskLevel: 'Medium',
              issue: 'Test issue 2',
              closureTiming: '30',
              evidenceExpectation: null,
              bestPractice: null,
            },
          ],
          deletes: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(2);
      expect(res.body.errors).toHaveLength(0);
    });

    it('updates existing items', async () => {
      await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000003',
              categoryCode: 'C',
              complianceCategory: 'Environment',
              topic: 'Environmental Responsibility',
              riskLevel: 'Low',
              issue: 'Original issue',
              closureTiming: '60',
              evidenceExpectation: null,
              bestPractice: null,
            },
          ],
          deletes: [],
        });

      const res = await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000003',
              categoryCode: 'C',
              complianceCategory: 'Environment',
              topic: 'Environmental Responsibility',
              riskLevel: 'High',
              issue: 'Updated issue',
              closureTiming: '90',
              evidenceExpectation: 'New evidence',
              bestPractice: 'New best practice',
            },
          ],
          deletes: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(1);
      expect(res.body.errors).toHaveLength(0);

      const listRes = await request(app.getHttpServer())
        .get('/api/compliance-library')
        .query({ page: 1, perPage: 100 });

      const updated = listRes.body.data.find(
        (i: any) => i.id === '00000000-0000-0000-0000-000000000003',
      );
      expect(updated).toBeDefined();
      expect(updated.riskLevel).toBe('High');
      expect(updated.issue).toBe('Updated issue');
    });

    it('deletes items by id', async () => {
      await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000004',
              categoryCode: 'D',
              complianceCategory: 'Governance',
              topic: 'Discrimination',
              riskLevel: 'Medium',
              issue: 'To be deleted',
              closureTiming: '7',
              evidenceExpectation: null,
              bestPractice: null,
            },
          ],
          deletes: [],
        });

      const res = await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [],
          deletes: ['00000000-0000-0000-0000-000000000004'],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
      expect(res.body.errors).toHaveLength(0);

      const listRes = await request(app.getHttpServer())
        .get('/api/compliance-library')
        .query({ page: 1, perPage: 100 });

      const deleted = listRes.body.data.find(
        (i: any) => i.id === '00000000-0000-0000-0000-000000000004',
      );
      expect(deleted).toBeUndefined();
    });

    it('rejects entire batch on Zod validation failure (atomic)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000005',
              categoryCode: 'A',
              complianceCategory: 'Governance',
              topic: 'Key Compliance Requirements',
              riskLevel: 'High',
              issue: 'Valid item',
              closureTiming: '7',
              evidenceExpectation: null,
              bestPractice: null,
            },
            {
              id: 'not-a-uuid',
              categoryCode: 'INVALID_CODE',
              complianceCategory: 'InvalidCategory',
              topic: 'Invalid Topic',
              riskLevel: 'Critical',
              issue: '',
              closureTiming: '999',
              evidenceExpectation: null,
              bestPractice: null,
            },
          ],
          deletes: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it('returns validation errors with row, field, and message', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/compliance-library/bulk')
        .send({
          upserts: [
            {
              id: '00000000-0000-0000-0000-000000000006',
              categoryCode: 'X',
              complianceCategory: 'Governance',
              topic: 'Key Compliance Requirements',
              riskLevel: 'High',
              issue: 'Test',
              closureTiming: '7',
              evidenceExpectation: null,
              bestPractice: null,
            },
          ],
          deletes: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
      expect(res.body.errors.length).toBeGreaterThan(0);

      const err = res.body.errors[0];
      expect(err.row).toBe(0);
      expect(err.field).toBeDefined();
      expect(err.message).toBeDefined();
    });
  });
});

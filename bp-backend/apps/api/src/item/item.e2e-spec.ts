import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Redis } from 'ioredis';
import { AppModule } from '../app.module.js';
import { ItemEntity } from './entities/item.entity.js';

async function createTestApp(): Promise<{
  app: NestExpressApplication;
  dataSource: DataSource;
}> {
  process.env.NODE_ENV = 'test';
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  await app.init();

  const dataSource = app.get(DataSource);
  return { app, dataSource };
}

async function cleanupItems(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(ItemEntity);
  await repo.createQueryBuilder().delete().execute();
}

describe('Item oRPC routes (E2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeEach(async () => {
    const redis = new Redis({ host: 'localhost', port: 6379 });
    await redis.flushdb();
    await redis.quit();

    const harness = await createTestApp();
    app = harness.app;
    dataSource = harness.dataSource;
    await cleanupItems(dataSource);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('createItem', () => {
    it('creates a new item and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/items')
        .send({
          name: 'Test Item',
          description: 'A test item',
          status: 'active',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Test Item');
      expect(res.body.description).toBe('A test item');
      expect(res.body.status).toBe('active');
      expect(res.body.createdAt).toBeTruthy();
      expect(res.body.updatedAt).toBeTruthy();
    });
  });

  describe('listItems', () => {
    it('returns paginated list of items', async () => {
      await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Item 1', status: 'active' });
      await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Item 2', status: 'inactive' });

      const res = await request(app.getHttpServer())
        .get('/api/items')
        .query({ page: 1, perPage: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.currentPage).toBe(1);
      expect(res.body.meta.perPage).toBe(10);
    });

    it('filters by status', async () => {
      await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Active Item', status: 'active' });
      await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Inactive Item', status: 'inactive' });

      const res = await request(app.getHttpServer())
        .get('/api/items')
        .query({ page: 1, perPage: 10, status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Active Item');
    });
  });

  describe('getItem', () => {
    it('returns a single item by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Single Item', status: 'active' });

      const res = await request(app.getHttpServer()).get(
        `/api/items/${created.body.id}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe('Single Item');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/items/00000000-0000-0000-0000-000000000000',
      );

      expect(res.status).toBe(404);
    });
  });

  describe('updateItem', () => {
    it('updates an item and returns the updated item', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'Original Name', status: 'active' });

      const res = await request(app.getHttpServer())
        .put(`/api/items/${created.body.id}`)
        .send({ name: 'Updated Name', status: 'inactive' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.status).toBe('inactive');
    });
  });

  describe('deleteItem', () => {
    it('soft-deletes an item and returns 204', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/items')
        .send({ name: 'To Delete', status: 'active' });

      const res = await request(app.getHttpServer()).delete(
        `/api/items/${created.body.id}`,
      );

      expect(res.status).toBe(204);

      const listRes = await request(app.getHttpServer())
        .get('/api/items')
        .query({ page: 1, perPage: 10 });

      expect(listRes.body.data).toHaveLength(0);
    });
  });
});

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateItemsTable0000000000000 implements MigrationInterface {
  name = 'CreateItemsTable0000000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "Item" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "description" text,
        "status" varchar NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_Item_status" ON "Item" ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_Item_status"`);
    await queryRunner.query(`DROP TABLE "Item"`);
  }
}

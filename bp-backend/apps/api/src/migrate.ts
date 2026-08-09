import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const envPath = join(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
}

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'sc_boilerplate',
  entities: [join(process.cwd(), 'dist/apps/api/src/**/*.entity.js')],
  migrations: [join(process.cwd(), 'dist/apps/api/src/**/migrations/*.js')],
  synchronize: false,
  logging: true,
});

async function main() {
  const action = process.argv[2] || 'run';
  await dataSource.initialize();
  try {
    if (action === 'revert') {
      await dataSource.undoLastMigration();
      console.log('Migration reverted');
    } else {
      await dataSource.runMigrations();
      console.log('Migrations completed');
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

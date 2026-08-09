import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { env, isTest } from './env.config.js';

export const dataSourceOptions: TypeOrmModuleOptions = {
  type: 'postgres',
  host: env.DATABASE.HOST,
  port: env.DATABASE.PORT,
  username: env.DATABASE.USER,
  password: env.DATABASE.PASSWORD,
  database: env.DATABASE.NAME,
  entities: [`${env.ROOT_PATH}/**/*.entity.${isTest ? 'ts' : 'js'}`],
  synchronize: false,
  migrationsRun: true,
  autoLoadEntities: true,
  migrations: [
    join(env.ROOT_PATH, isTest ? '**/migrations/*.ts' : 'dist/**/migrations/*.js'),
  ],
  logging: false,
  ssl: env.DATABASE.SSL ? { rejectUnauthorized: false } : false,
  extra: { max: env.DATABASE.MAX_CONNECTION },
  poolSize: env.DATABASE.POOL_SIZE,
};

export const databaseConfig = TypeOrmModule.forRoot(dataSourceOptions);

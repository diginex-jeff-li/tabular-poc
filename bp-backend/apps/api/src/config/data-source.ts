import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from './database.config.js';

export default new DataSource({
  ...(dataSourceOptions as DataSourceOptions),
  migrationsRun: false,
});

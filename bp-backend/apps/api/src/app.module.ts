import { Module } from '@nestjs/common';
import { GlobalCacheModule } from './config/cache.config.js';
import { databaseConfig } from './config/database.config.js';
import { orpcConfig } from './config/orpc.config.js';
import { OrpcExceptionModule } from './config/orpc-exception.module.js';
import { RedisModule } from './config/redis.config.js';
import { HealthModule } from './health/health.module.js';
import { ItemModule } from './item/item.module.js';
import { ComplianceLibraryModule } from './compliance-library/compliance-library.module.js';

@Module({
  imports: [
    databaseConfig,
    RedisModule,
    GlobalCacheModule,
    OrpcExceptionModule,
    HealthModule,
    ItemModule,
    ComplianceLibraryModule,
    orpcConfig,
  ],
  controllers: [],
})
export class AppModule {}

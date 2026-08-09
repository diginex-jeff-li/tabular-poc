import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from './env.config.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const redisClient = new Redis({
  host: env.REDIS.HOST,
  port: env.REDIS.PORT,
  lazyConnect: false,
});

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT, useValue: redisClient }],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

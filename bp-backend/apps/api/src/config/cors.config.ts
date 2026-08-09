import { type CorsOptions } from '@nestjs/common';
import { env } from './env.config.js';

export const corsConfig: CorsOptions = {
  origin: env.WHITELIST.length > 0 ? env.WHITELIST : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
};

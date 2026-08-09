import { z } from 'zod';

const envSchema = z
  .object({
    DATABASE_HOST: z.string().default('localhost'),
    DATABASE_PORT: z.coerce.number().default(5432),
    DATABASE_USER: z.string().default('postgres'),
    DATABASE_PASSWORD: z.string().default('postgres'),
    DATABASE_NAME: z.string().default('sc_boilerplate'),
    DATABASE_SSL: z.coerce.boolean().default(false),
    DATABASE_MAX_CONNECTION: z.coerce.number().default(50),
    DATABASE_POOL_SIZE: z.coerce.number().default(50),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),
    APP_PORT: z.coerce.number().default(3002),
    APP_PREFIX: z.string().default('api'),
    LOG_LEVEL: z.string().default('log'),
    WHITELIST: z.string().default(''),
    ITEM_CACHE_TTL: z.coerce.number().default(300),
  })
  .transform((raw) => ({
    DATABASE: {
      HOST: raw.DATABASE_HOST,
      PORT: raw.DATABASE_PORT,
      USER: raw.DATABASE_USER,
      PASSWORD: raw.DATABASE_PASSWORD,
      NAME: raw.DATABASE_NAME,
      SSL: raw.DATABASE_SSL,
      MAX_CONNECTION: raw.DATABASE_MAX_CONNECTION,
      POOL_SIZE: raw.DATABASE_POOL_SIZE,
    },
    REDIS: {
      HOST: raw.REDIS_HOST,
      PORT: raw.REDIS_PORT,
    },
    APP_PORT: raw.APP_PORT,
    APP_PREFIX: raw.APP_PREFIX,
    LOG_LEVEL: raw.LOG_LEVEL,
    WHITELIST: raw.WHITELIST
      ? raw.WHITELIST.split(',')
          .map((url) => url.trim())
          .filter(Boolean)
      : [],
    ITEM_CACHE_TTL: raw.ITEM_CACHE_TTL,
    ROOT_PATH:
      process.cwd() + (process.env.NODE_ENV === 'test' ? '/src' : ''),
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.issues);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
export const isTest = process.env.NODE_ENV === 'test';

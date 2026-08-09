import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { env } from './config/env.config.js';

async function startApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableCors({ origin: env.WHITELIST.length > 0 ? env.WHITELIST : true });

  app.enableShutdownHooks();
  app.setGlobalPrefix(env.APP_PREFIX);
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  await app.listen(env.APP_PORT);
  console.log(`API running on http://localhost:${env.APP_PORT}/${env.APP_PREFIX}`);
}

startApp()
  .then(() => console.log('Init app success'))
  .catch(console.error);

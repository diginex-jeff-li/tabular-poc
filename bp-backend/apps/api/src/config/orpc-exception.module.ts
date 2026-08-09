import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { OrpcExceptionFilter } from './orpc-exception.filter.js';

@Global()
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: OrpcExceptionFilter,
    },
  ],
})
export class OrpcExceptionModule {}

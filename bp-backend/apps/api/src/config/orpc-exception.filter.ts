import { Catch, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { ORPCError } from '@orpc/nest';
import type { Response } from 'express';

@Catch(ORPCError)
export class OrpcExceptionFilter implements ExceptionFilter {
  catch(exception: ORPCError<string, unknown>, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.status ?? 500;
    if (!res.headersSent) {
      res.status(status).json({
        statusCode: status,
        message: exception.message,
      });
    }
  }
}

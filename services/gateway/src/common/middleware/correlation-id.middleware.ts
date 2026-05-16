import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../constants/correlation-id.constant';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingValue = req.header(CORRELATION_ID_HEADER);
    const correlationId =
      incomingValue && incomingValue.trim().length > 0
        ? incomingValue.trim()
        : randomUUID();

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    (req as Request & { correlationId?: string }).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}

import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { CORRELATION_ID_HEADER } from '../constants/correlation-id.constant';
import type { NextFunction, Request, Response } from 'express';

type MockRequest = {
  header: (name: string) => string | undefined;
  headers: Record<string, string | undefined>;
  correlationId?: string;
};

type MockResponse = {
  setHeader: (name: string, value: string) => void;
};

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should keep incoming correlationId when provided', () => {
    const req: MockRequest = {
      header: jest.fn().mockReturnValue('corr-123'),
      headers: {},
    };
    const setHeader = jest.fn();
    const res: MockResponse = { setHeader };
    const next = jest.fn();

    middleware.use(
      req as unknown as Request,
      res as unknown as Response,
      next as NextFunction,
    );

    expect(req.headers[CORRELATION_ID_HEADER]).toBe('corr-123');
    expect(req.correlationId).toBe('corr-123');
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'corr-123');
    expect(next).toHaveBeenCalled();
  });

  it('should generate correlationId when missing', () => {
    const req: MockRequest = {
      header: jest.fn().mockReturnValue(undefined),
      headers: {},
    };
    const setHeader = jest.fn();
    const res: MockResponse = { setHeader };
    const next = jest.fn();

    middleware.use(
      req as unknown as Request,
      res as unknown as Response,
      next as NextFunction,
    );

    expect(typeof req.headers[CORRELATION_ID_HEADER]).toBe('string');
    expect(req.headers[CORRELATION_ID_HEADER]).toHaveLength(36);
    expect(req.correlationId).toBe(req.headers[CORRELATION_ID_HEADER]);
    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      req.headers[CORRELATION_ID_HEADER],
    );
    expect(next).toHaveBeenCalled();
  });
});

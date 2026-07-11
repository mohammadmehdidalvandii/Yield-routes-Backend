import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

// ─── AppError ────────────────────────────────────────────────────────────────
// Throw this from controllers/services for expected, handled errors.
// The global error handler maps it to the correct HTTP status + body.
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Request ID middleware ────────────────────────────────────────────────────
// Stamps every request with a unique x-request-id so logs can be correlated.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id =
    (req.headers['x-request-id'] as string) ??
    `yr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}

// ─── Global error handler ────────────────────────────────────────────────────
// Must be registered with four parameters so Express recognises it as an
// error-handling middleware.
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const reqId = req.headers['x-request-id'] as string | undefined;

  if (err instanceof AppError) {
    logger.warn(`[${reqId}] AppError ${err.statusCode} ${err.code}: ${err.message}`);
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.detail ? { detail: err.detail } : {}),
      requestId: reqId,
    });
    return;
  }

  // Unexpected errors — log full stack
  logger.error(`[${reqId}] Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId: reqId,
  });
}

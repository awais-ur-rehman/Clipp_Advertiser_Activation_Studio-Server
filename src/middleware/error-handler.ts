import type { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err instanceof ValidationError) {
      res.status(err.statusCode).json({
        error: err.message,
        fields: err.fields ?? {},
        correlation_id: req.correlationId,
      });
      return;
    }

    res.status(err.statusCode).json({
      error: err.message,
      correlation_id: req.correlationId,
    });
    return;
  }

  logger.error({
    event: 'unhandled_error',
    correlation_id: req.correlationId,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error',
    correlation_id: req.correlationId,
  });
}

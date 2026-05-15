import type { Request, Response, NextFunction } from 'express';
import { env } from '../lib/env.js';
import { UnauthorizedError } from '../errors/app-error.js';

export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | string[] | undefined;
  const provided = Array.isArray(key) ? key[0] : key;
  if (provided !== env.API_KEY) {
    next(new UnauthorizedError('Invalid or missing X-API-Key header'));
    return;
  }
  next();
}

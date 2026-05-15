import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmenting express types
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
  next();
}

import type { Request, Response, NextFunction } from 'express';
import { getFunnelStats } from '../services/funnel.service.js';

export async function getFunnel(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getFunnelStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

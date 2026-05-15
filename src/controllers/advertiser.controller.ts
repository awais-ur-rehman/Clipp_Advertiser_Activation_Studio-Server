import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listAdvertisers,
  recordCouponDesigned,
  recordCouponPublished,
} from '../services/advertiser.service.js';
import { ValidationError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function getAdvertisers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    next(new ValidationError('Invalid query parameters', parsed.error.flatten().fieldErrors));
    return;
  }

  try {
    const result = await listAdvertisers(parsed.data.page, parsed.data.limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function couponDesigned(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const result = await recordCouponDesigned(id);

    logger.info({
      event: 'coupon_designed',
      correlation_id: req.correlationId,
      advertiser_id: id,
      result: result.result,
    });

    res.json({ advertiser_id: id, ...result });
  } catch (err) {
    next(err);
  }
}

export async function couponPublished(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const result = await recordCouponPublished(id);

    logger.info({
      event: 'coupon_published',
      correlation_id: req.correlationId,
      advertiser_id: id,
      result: result.result,
    });

    res.json({ advertiser_id: id, ...result });
  } catch (err) {
    next(err);
  }
}

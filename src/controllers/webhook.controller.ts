import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { signUpAdvertiser } from '../services/webhook.service.js';
import { ValidationError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

const signUpSchema = z.object({
  business_name: z.string().min(1).max(255),
  email: z.string().email(),
});

export async function handleAdvertiserSignedUp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ValidationError('Invalid request body', parsed.error.flatten().fieldErrors));
    return;
  }

  try {
    const result = await signUpAdvertiser(parsed.data.business_name, parsed.data.email);

    logger.info({
      event: 'advertiser_signed_up',
      correlation_id: req.correlationId,
      advertiser_id: result.advertiserId,
      variant: result.variant,
      tasks_enqueued: result.tasksEnqueued,
      result: 'success',
    });

    res.status(201).json({
      advertiser_id: result.advertiserId,
      variant: result.variant,
      tasks_enqueued: result.tasksEnqueued,
    });
  } catch (err) {
    next(err);
  }
}

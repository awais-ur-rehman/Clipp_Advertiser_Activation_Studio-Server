import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDlqWithHealth, retryDeadLetterTask } from '../services/task.service.js';
import { ValidationError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

const retrySchema = z.object({
  task_id: z.string().cuid(),
});

export async function getDlq(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await getDlqWithHealth();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function retryDlqTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = retrySchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ValidationError('Invalid request body', parsed.error.flatten().fieldErrors));
    return;
  }

  try {
    const result = await retryDeadLetterTask(parsed.data.task_id);

    logger.info({
      event: 'dlq_retry_requested',
      correlation_id: req.correlationId,
      task_id: parsed.data.task_id,
      result: result.result,
    });

    res.json({ task_id: parsed.data.task_id, ...result });
  } catch (err) {
    next(err);
  }
}

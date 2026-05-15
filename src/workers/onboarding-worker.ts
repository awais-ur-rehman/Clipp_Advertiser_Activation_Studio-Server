import { Worker, type Job } from 'bullmq';
import { TaskState, TaskKind } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { QUEUE_NAME, type OnboardingJobData } from '../queue/onboarding-queue.js';

const CONDITIONAL_KINDS = new Set<TaskKind>([TaskKind.DAY_3_CHECK_IN, TaskKind.DAY_7_SALES_HANDOFF]);

async function processOnboardingJob(job: Job<OnboardingJobData>): Promise<void> {
  const { taskId, advertiserId, kind } = job.data;

  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) {
    logger.warn({ event: 'task_not_found', advertiser_id: advertiserId, task_id: taskId, kind });
    return;
  }

  if (task.state === TaskState.COMPLETED) {
    logger.info({
      event: 'task_already_completed',
      advertiser_id: advertiserId,
      task_id: taskId,
      kind,
      result: 'skipped_already_done',
    });
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { state: TaskState.RUNNING, attempts: { increment: 1 } },
  });

  if (CONDITIONAL_KINDS.has(kind)) {
    const advertiser = await prisma.advertiser.findUnique({ where: { id: advertiserId } });

    const shouldSkip =
      (kind === TaskKind.DAY_3_CHECK_IN && advertiser?.firstCouponAt !== null) ||
      (kind === TaskKind.DAY_7_SALES_HANDOFF && advertiser?.firstPublishAt !== null);

    if (shouldSkip) {
      await prisma.task.update({
        where: { id: taskId },
        data: { state: TaskState.COMPLETED, completedAt: new Date() },
      });
      logger.info({
        event: 'task_skipped',
        advertiser_id: advertiserId,
        task_id: taskId,
        kind,
        result: 'skipped_condition_unmet',
      });
      return;
    }
  }

  await simulateTaskExecution(kind, advertiserId, taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: { state: TaskState.COMPLETED, completedAt: new Date() },
  });

  logger.info({
    event: 'task_completed',
    advertiser_id: advertiserId,
    task_id: taskId,
    kind,
    attempt: job.attemptsMade + 1,
    result: 'success',
  });
}

async function simulateTaskExecution(
  kind: TaskKind,
  advertiserId: string,
  taskId: string,
): Promise<void> {
  const actions: Record<TaskKind, string> = {
    [TaskKind.WELCOME_EMAIL]: 'welcome email sent to advertiser',
    [TaskKind.ACCOUNT_SETUP_NUDGE]: 'account setup nudge email sent',
    [TaskKind.FIRST_COUPON_DESIGN_NUDGE]: 'first coupon design nudge sent',
    [TaskKind.DAY_3_CHECK_IN]: 'day 3 check-in message sent',
    [TaskKind.DAY_7_SALES_HANDOFF]: 'day 7 sales team handoff triggered',
  };

  logger.info({
    event: 'task_execution',
    advertiser_id: advertiserId,
    task_id: taskId,
    kind,
    action: actions[kind],
    result: 'simulated',
  });
}

export function createOnboardingWorker(): Worker<OnboardingJobData> {
  const worker = new Worker<OnboardingJobData>(QUEUE_NAME, processOnboardingJob, {
    connection: redis,
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;

    const { taskId, advertiserId, kind } = job.data;
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3);

    await prisma.task.update({
      where: { id: taskId },
      data: {
        state: isLastAttempt ? TaskState.DEAD_LETTER : TaskState.FAILED,
        lastError: err.message,
        attempts: job.attemptsMade,
      },
    });

    logger.error({
      event: isLastAttempt ? 'task_dead_lettered' : 'task_failed',
      advertiser_id: advertiserId,
      task_id: taskId,
      kind,
      attempt: job.attemptsMade,
      error: err.message,
      result: isLastAttempt ? 'dead_letter' : 'will_retry',
    });
  });

  worker.on('error', (err) => {
    logger.error({ event: 'worker_error', error: err.message });
  });

  return worker;
}

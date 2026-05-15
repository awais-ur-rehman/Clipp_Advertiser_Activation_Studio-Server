import { Queue } from 'bullmq';
import { Variant, TaskKind } from '@prisma/client';
import { redis } from '../lib/redis.js';

export const QUEUE_NAME = 'onboarding';

export interface OnboardingJobData {
  taskId: string;
  advertiserId: string;
  kind: TaskKind;
}

export const onboardingQueue = new Queue<OnboardingJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

interface TaskSchedule {
  kind: TaskKind;
  delayMs: number;
  conditional: boolean;
}

const VARIANT_A_SCHEDULE: TaskSchedule[] = [
  { kind: TaskKind.WELCOME_EMAIL, delayMs: 0, conditional: false },
  { kind: TaskKind.ACCOUNT_SETUP_NUDGE, delayMs: 24 * 60 * 60 * 1000, conditional: false },
  { kind: TaskKind.FIRST_COUPON_DESIGN_NUDGE, delayMs: 72 * 60 * 60 * 1000, conditional: false },
  { kind: TaskKind.DAY_3_CHECK_IN, delayMs: 96 * 60 * 60 * 1000, conditional: true },
  { kind: TaskKind.DAY_7_SALES_HANDOFF, delayMs: 168 * 60 * 60 * 1000, conditional: true },
];

const VARIANT_B_SCHEDULE: TaskSchedule[] = [
  { kind: TaskKind.WELCOME_EMAIL, delayMs: 0, conditional: false },
  {
    kind: TaskKind.FIRST_COUPON_DESIGN_NUDGE,
    delayMs: 24 * 60 * 60 * 1000,
    conditional: false,
  },
  { kind: TaskKind.DAY_3_CHECK_IN, delayMs: 72 * 60 * 60 * 1000, conditional: true },
];

export function getScheduleForVariant(variant: Variant): TaskSchedule[] {
  return variant === Variant.A ? VARIANT_A_SCHEDULE : VARIANT_B_SCHEDULE;
}

export async function enqueueOnboardingTasks(
  jobs: Array<{ taskId: string; advertiserId: string; kind: TaskKind; delayMs: number }>,
): Promise<void> {
  const bulk = jobs.map((j) => ({
    name: j.kind,
    data: { taskId: j.taskId, advertiserId: j.advertiserId, kind: j.kind },
    opts: { delay: j.delayMs, jobId: j.taskId },
  }));
  await onboardingQueue.addBulk(bulk);
}

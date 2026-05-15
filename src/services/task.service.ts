import { prisma } from '../lib/prisma.js';
import { onboardingQueue } from '../queue/onboarding-queue.js';
import { NotFoundError, ValidationError } from '../errors/app-error.js';
import { TaskState } from '@prisma/client';

export interface QueueHealth {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead_letter: number;
}

export interface DlqResponse {
  queue_health: QueueHealth;
  dlq: Awaited<ReturnType<typeof fetchDlqTasks>>;
}

function fetchDlqTasks() {
  return prisma.task.findMany({
    where: { state: TaskState.DEAD_LETTER },
    include: {
      advertiser: { select: { businessName: true, email: true, variant: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getDlqWithHealth(): Promise<DlqResponse> {
  const [dlq, stateCounts] = await Promise.all([
    fetchDlqTasks(),
    prisma.task.groupBy({ by: ['state'], _count: { state: true } }),
  ]);

  const counts = Object.fromEntries(
    stateCounts.map((s) => [s.state, s._count.state]),
  ) as Record<string, number>;

  return {
    queue_health: {
      pending: counts[TaskState.PENDING] ?? 0,
      running: counts[TaskState.RUNNING] ?? 0,
      completed: counts[TaskState.COMPLETED] ?? 0,
      failed: counts[TaskState.FAILED] ?? 0,
      dead_letter: counts[TaskState.DEAD_LETTER] ?? 0,
    },
    dlq,
  };
}

export async function retryDeadLetterTask(taskId: string): Promise<{ result: 'requeued' }> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError(`Task ${taskId} not found`);
  if (task.state !== TaskState.DEAD_LETTER) {
    throw new ValidationError(`Task ${taskId} is not in DEAD_LETTER state`);
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { state: TaskState.PENDING, attempts: 0, lastError: null },
  });

  await onboardingQueue.add(
    task.kind,
    { taskId: task.id, advertiserId: task.advertiserId, kind: task.kind },
    { jobId: `retry-${task.id}-${Date.now()}`, attempts: 3 },
  );

  return { result: 'requeued' };
}

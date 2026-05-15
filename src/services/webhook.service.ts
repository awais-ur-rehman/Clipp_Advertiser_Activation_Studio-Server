import { prisma } from '../lib/prisma.js';
import { assignVariant } from '../experiments/variant-assignment.js';
import { getScheduleForVariant, enqueueOnboardingTasks } from '../queue/onboarding-queue.js';
import { ConflictError } from '../errors/app-error.js';
import { Variant } from '@prisma/client';

export interface SignUpResult {
  advertiserId: string;
  variant: Variant;
  tasksEnqueued: number;
}

export async function signUpAdvertiser(
  businessName: string,
  email: string,
): Promise<SignUpResult> {
  const existing = await prisma.advertiser.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError(`Advertiser with email ${email} already exists`);
  }

  const advertiser = await prisma.advertiser.create({
    data: {
      businessName,
      email,
      variant: assignVariant(email),
    },
  });

  const schedule = getScheduleForVariant(advertiser.variant);
  const now = new Date();

  const tasks = await prisma.$transaction(
    schedule.map((s) =>
      prisma.task.create({
        data: {
          advertiserId: advertiser.id,
          kind: s.kind,
          scheduledFor: new Date(now.getTime() + s.delayMs),
        },
      }),
    ),
  );

  await enqueueOnboardingTasks(
    tasks.map((t, i) => ({
      taskId: t.id,
      advertiserId: advertiser.id,
      kind: t.kind,
      delayMs: schedule[i]?.delayMs ?? 0,
    })),
  );

  return {
    advertiserId: advertiser.id,
    variant: advertiser.variant,
    tasksEnqueued: tasks.length,
  };
}

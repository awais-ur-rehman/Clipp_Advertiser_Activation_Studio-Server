import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../errors/app-error.js';
import { TaskState } from '@prisma/client';

export interface PaginatedAdvertisers {
  data: Awaited<ReturnType<typeof fetchAdvertisers>>;
  pagination: { page: number; limit: number; total: number; pages: number };
}

async function fetchAdvertisers(skip: number, take: number) {
  return prisma.advertiser.findMany({
    skip,
    take,
    orderBy: { signedUpAt: 'desc' },
    include: {
      tasks: {
        orderBy: { scheduledFor: 'asc' },
        select: {
          id: true,
          kind: true,
          state: true,
          scheduledFor: true,
          completedAt: true,
          attempts: true,
          lastError: true,
        },
      },
    },
  });
}

export async function listAdvertisers(page: number, limit: number): Promise<PaginatedAdvertisers> {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    fetchAdvertisers(skip, limit),
    prisma.advertiser.count(),
  ]);

  return {
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function recordCouponDesigned(
  advertiserId: string,
): Promise<{ result: 'recorded' | 'already_recorded' }> {
  const advertiser = await prisma.advertiser.findUnique({ where: { id: advertiserId } });
  if (!advertiser) throw new NotFoundError(`Advertiser ${advertiserId} not found`);
  if (advertiser.firstCouponAt) return { result: 'already_recorded' };

  await prisma.$transaction([
    prisma.advertiser.update({
      where: { id: advertiserId },
      data: { firstCouponAt: new Date() },
    }),
    prisma.task.updateMany({
      where: { advertiserId, kind: 'DAY_3_CHECK_IN', state: { in: [TaskState.PENDING] } },
      data: { state: TaskState.COMPLETED, completedAt: new Date() },
    }),
  ]);

  return { result: 'recorded' };
}

export async function recordCouponPublished(
  advertiserId: string,
): Promise<{ result: 'recorded' | 'already_recorded' }> {
  const advertiser = await prisma.advertiser.findUnique({ where: { id: advertiserId } });
  if (!advertiser) throw new NotFoundError(`Advertiser ${advertiserId} not found`);
  if (advertiser.firstPublishAt) return { result: 'already_recorded' };

  await prisma.$transaction([
    prisma.advertiser.update({
      where: { id: advertiserId },
      data: { firstPublishAt: new Date() },
    }),
    prisma.task.updateMany({
      where: {
        advertiserId,
        kind: 'DAY_7_SALES_HANDOFF',
        state: { in: [TaskState.PENDING] },
      },
      data: { state: TaskState.COMPLETED, completedAt: new Date() },
    }),
  ]);

  return { result: 'recorded' };
}

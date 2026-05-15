import './lib/env.js';
import { createOnboardingWorker } from './workers/onboarding-worker.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const worker = createOnboardingWorker();

logger.info({ event: 'worker_started', queue: 'onboarding' });

async function shutdown(signal: string): Promise<void> {
  logger.info({ event: 'worker_shutdown_initiated', signal });
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  logger.info({ event: 'worker_shutdown_complete' });
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

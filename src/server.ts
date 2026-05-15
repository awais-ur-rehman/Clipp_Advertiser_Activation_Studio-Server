import './lib/env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { webhookRouter } from './routes/webhook.js';
import { advertisersRouter } from './routes/advertisers.js';
import { funnelRouter } from './routes/funnel.js';
import { tasksRouter } from './routes/tasks.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './lib/logger.js';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }));
app.use(express.json());
app.use(requestId);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

app.use('/webhooks', webhookRouter);
app.use('/api/advertisers', advertisersRouter);
app.use('/api/funnel', funnelRouter);
app.use('/api/tasks', tasksRouter);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ event: 'server_started', port: env.PORT, env: env.NODE_ENV });
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ event: 'shutdown_initiated', signal });
  server.close(async () => {
    await prisma.$disconnect();
    logger.info({ event: 'shutdown_complete' });
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };

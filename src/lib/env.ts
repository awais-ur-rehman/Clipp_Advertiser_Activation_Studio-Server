import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_KEY: z.string().min(16),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
